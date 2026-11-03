import { format, type Decimal } from '../game/num';
import { HALLS, canEnterHorizon, enterHorizon, openGate, nodeAvailable, nodeCost, nodeDone, gateReady, horizonRates, machineCost, productionPlan, buyMachine, connectHorizon, buildTargets, assemblyFlow, assemblyForecast, assemblyReady,canCommission,startCommission,commissionCost,powerCapacity,chargeRate,setPowerMode,installRegulator,launchPower,chooseHallRecipe, setRouting, installDispatcher, routingShares, type Machine, type BuildMode } from '../game/horizon';
import type { GameState } from '../game/state';
import { el } from './dom';
import { HorizonCam } from './horizonCam';
import { UmeOrder } from './umeOrder';
import { HorizonFirstHall } from './horizonFirstHall';
import { profileOf } from '../game/horizonLab';

function forecastTime(seconds:Decimal):string {
  if(seconds.lt(60))return '<1 мин';
  const minutes=seconds.div(60).ceil();
  if(minutes.lt(60))return `≈${format(minutes)} мин`;
  if(minutes.lt(1440)){const rest=minutes.mod(60);return `≈${format(minutes.div(60).floor())} ч${rest.gt(0)?` ${format(rest)} мин`:''}`;}
  return `≈${format(seconds.div(86400))} дн`;
}

export class HorizonPanel {
  readonly root = el('section', 'panel horizon');
  readonly camera: HorizonCam;
  private firstHall: HorizonFirstHall;
  private entry = el('div', 'h-entry');
  private entryText = el('p', 's-why');
  private enter = el('button', 'btn', 'ОБСЛЕДОВАТЬ СТЫК');
  private content = el('div', 'h-content');
  private wallet = el('div', 'h-wallet');
  private ume = el('div', 'h-note');
  private umeOrder: UmeOrder;
  private title = el('h2', 'panel-title');
  private nodeText = el('div', 'h-node-text');
  private inspection = el('div', 'h-inspection');
  private inspectedText = el('p', 'h-note');
  private assign = el('button', 'btn', 'НАЗНАЧИТЬ МОНТАЖ');
  private inspected: number | null = null;
  private nodes = el('div', 'h-nodes');
  private modes = el('div', 'h-modes');
  private allocation=el('div','h-allocation');
  private allocationNote=el('p','h-note h-allocation-note');
  private dispatcher=el('div','h-dispatcher');
  private dispatchToggle=el('button','btn h-dispatch-toggle');
  private dispatchBody=el('div','h-dispatch-body');
  private dispatchNext=el('p','h-note');
  private dispatchFinish=el('p','h-note');
  private gate = el('button', 'btn h-gate', 'ОТКРЫТЬ · 1 УМЕ');
  private note = el('div', 'h-note');
  private commission=el('div','h-commission');
  private commissionText=el('p','h-note');
  private commissionBar=el('progress','h-power-bar');
  private commissionButtons=new Map<'feed'|'drive',HTMLButtonElement>();
  private power=el('div','h-power');
  private powerText=el('p','h-note');
  private powerBar=el('progress','h-power-bar');
  private pulse=el('button','btn','ЗАПУСТИТЬ ПРИВОД');
  private regulator=el('button','btn','УСТАНОВИТЬ РЕГУЛЯТОР · 400 КМ');
  private powerButtons=new Map<string,HTMLButtonElement>();
  private routing=el('div','h-routing');
  private routeNote=el('p','h-note');
  private routeButtons=new Map<string,HTMLButtonElement>();
  private install=el('button','btn','УСТАНОВИТЬ ДИСПЕТЧЕР · 200 КМ');
  private recipe=el('div','h-recipe');
  private recipeText=el('p','h-note');
  private recipeButtons=new Map<'heavy'|'precise',{root:HTMLElement;button:HTMLButtonElement}>();
  private history = el('select', 'h-select');
  private lock = el('select', 'h-select');
  private production = el('div', 'h-machines');
  private investment = el('p', 'h-note h-investment');
  private investAuto = el('button', 'btn h-invest-auto');
  private machineRows = new Map<Machine, { text: HTMLElement; buy: HTMLButtonElement }>();
  private options: { input: HTMLInputElement; key: 'autoBuild' | 'autoBuy' | 'reserveUme' }[] = [];
  private connections = el('div', 'h-connections');
  private connectionRows = new Map<'frame'|'conductor', HTMLButtonElement>();
  private renderedHall = -1;
  private viewedHall = -1;
  private identity: GameState['horizon'] | null = null;
  private currentButtons: HTMLButtonElement[] = [];
  constructor(private getState: () => GameState, private onChange: () => void, private visitMine: () => void) {
    this.firstHall=new HorizonFirstHall(getState,onChange,visitMine);
    this.umeOrder=new UmeOrder(getState,onChange);
    this.camera = new HorizonCam(i => {
      const h = this.getState().horizon;
      if (this.viewedHall >= 0 && this.viewedHall !== h.opened) return;
      this.inspected = i; this.onChange();
    });
    this.enter.type = 'button'; this.enter.addEventListener('click', () => { const s = this.getState(); if (enterHorizon(s.horizon, s.bottom, profileOf(s))) this.onChange(); });
    this.entry.append(el('h2', 'panel-title', 'Металлический стык'), this.entryText, this.enter);
    this.recipe.append(el('h3','','ПРОФИЛЬ СБОРКИ'),this.recipeText);
    for(const [id,label,description] of [['heavy','КРУПНЫЕ УЗЛЫ','Шахта ускоряет монтаж. Платформа −20% КМ. После зала транспорт +20%, монтаж +10%.'],['precise','ТОЧНЫЕ УЗЛЫ','Сортировка ускоряет монтаж. Силовая линия −30% КМ. После зала переработка +20%, выпуск +8%.']] as const){
      const root=el('div','h-recipe-option'),button=el('button','btn',label);button.type='button';button.addEventListener('click',()=>{if(chooseHallRecipe(this.getState().horizon,id))this.onChange();});
      root.append(el('p','h-note',description),button);this.recipeButtons.set(id,{root,button});this.recipe.append(root);
    }
    this.commission.append(el('h3','','ПУСКОНАЛАДКА ГЛАВНОГО МЕХАНИЗМА'),el('p','h-note','Подача проверяется после сборки обеих рам, привод — после сопряжения. Каждое испытание оплачивается один раз и идёт само, включая офлайн. Итоговый запуск: доход свалки +25%.'),this.commissionText,this.commissionBar);
    this.commissionBar.max=1;this.commissionBar.setAttribute('aria-label','Испытание механизма');
    for(const kind of ['feed','drive'] as const){const b=el('button','btn');b.type='button';b.dataset.commission=kind;b.addEventListener('click',()=>{if(startCommission(this.getState().horizon,this.getState().city,kind))this.onChange();});this.commissionButtons.set(kind,b);this.commission.append(b);}
    this.power.append(el('h3','','СИЛОВОЙ НАКОПИТЕЛЬ'),el('p','h-note','25% выпуска → заряд. 1 ЭН → 1,5 КМ монтажа. УМЕ нужна при открытии зала.'),this.powerText,this.powerBar);
    this.powerBar.max=1;this.powerBar.setAttribute('aria-label','Заряд накопителя');
    for(const [id,label] of [['steady','ПОСТОЯННАЯ РАБОТА'],['charge','НАКОПЛЕНИЕ']] as const){const b=el('button','btn',label);b.type='button';b.dataset.power=id;b.addEventListener('click',()=>{if(setPowerMode(this.getState().horizon,id))this.onChange();});this.powerButtons.set(id,b);this.power.append(b);}
    this.pulse.type='button';this.pulse.addEventListener('click',()=>{const h=this.getState().horizon;if(this.inspected!==null&&nodeAvailable(h,this.inspected))h.selected=this.inspected;if(launchPower(h))this.onChange();});
    this.regulator.type='button';this.regulator.addEventListener('click',()=>{if(installRegulator(this.getState().horizon))this.onChange();});this.power.append(this.pulse,this.regulator);
    this.routing.append(el('h3','','РАСПРЕДЕЛЕНИЕ ПОДАЧИ'),el('p','h-note','Левый участок после сборки даёт выпуск +15%, правый — монтаж +20%. Город усиливает общую пропускную способность.'),this.routeNote);
    for(const [route,label] of [['even','ПОРОВНУ'],['left','ЛЕВЫЙ 80%'],['right','ПРАВЫЙ 80%'],['auto','АВТО']] as const){const button=el('button','btn',label);button.type='button';button.dataset.routing=route;button.addEventListener('click',()=>{if(setRouting(this.getState().horizon,route))this.onChange();});this.routeButtons.set(route,button);this.routing.append(button);}
    this.install.type='button';this.install.addEventListener('click',()=>{if(installDispatcher(this.getState().horizon))this.onChange();});this.routing.append(this.install);
    for (const [id, label] of [['growth','РОСТ'],['balance','БАЛАНС'],['assembly','СБОРКА']] as [BuildMode,string][]) {
      const b=el('button','btn',label);b.type='button';b.dataset.mode=id;
      b.addEventListener('click',()=>{this.getState().horizon.mode=id;this.onChange();});this.modes.append(b);
    }
    this.allocation.setAttribute('role','group');this.allocation.setAttribute('aria-label','Распределение общей мощности монтажа');
    for(const [parallel,label] of [[false,'ОДИН УЗЕЛ'],[true,'ДВА УЗЛА']] as const){
      const b=el('button','btn',label);b.type='button';b.dataset.parallel=String(parallel);
      b.addEventListener('click',()=>{const h=this.getState().horizon;h.parallel=parallel;h.pinned=false;this.onChange();});this.allocation.append(b);
    }
    this.dispatchToggle.type='button';this.dispatchToggle.addEventListener('click',()=>{
      const h=this.getState().horizon;if(h.opened<3)return;h.forecast=!h.forecast;this.onChange();
    });
    this.dispatchBody.append(this.dispatchNext,this.dispatchFinish,el('p','h-note','При текущих мощностях, без будущих покупок. Прогноз заканчивается готовностью монтажа; УМЕ и ручное открытие — отдельно.'));
    this.dispatcher.append(this.dispatchToggle,this.dispatchBody);
    this.gate.type='button';this.gate.addEventListener('click',()=>{
      const s=this.getState();const old=s.horizon.opened;
      if(gateReady(s.horizon)&&s.bottom.ume.lt(1)){this.visitMine();return;}
      if(openGate(s.horizon,s.bottom)){this.viewedHall=-1;this.inspected=null;this.camera.opened(old);this.onChange();this.camera.root.scrollIntoView({block:'start'});}
    });
    this.assign.type='button';this.assign.addEventListener('click',()=>{
      const h=this.getState().horizon;
      if(this.inspected===null||!nodeAvailable(h,this.inspected))return;
      h.selected=this.inspected;h.pinned=true;h.autoBuild=true;
      if(h.mode==='growth')h.mode='balance';
      this.onChange();
    });
    this.inspection.append(this.inspectedText,this.assign);this.inspection.hidden=true;
    const settings=el('details','h-settings');settings.append(el('summary','','Автоматика и резерв'));
    for(const [key,label] of [['autoBuild','Автомонтаж'],['autoBuy','Автопокупка полезных улучшений'],['reserveUme','Копить 1 УМЕ на текущий затвор']] as const){
      const row=el('label','h-toggle');const input=el('input','');input.type='checkbox';
      input.addEventListener('change',()=>{const h=this.getState().horizon;h[key]=input.checked;if(key==='autoBuild'&&input.checked)h.pinned=false;this.onChange();});
      row.append(input,document.createTextNode(label));settings.append(row);this.options.push({input,key});
    }
    this.lock.setAttribute('aria-label','Закрепить следующую покупку');
    this.lock.append(new Option('Покупки: по полезности',''),new Option('Копить: транспорт','transport'),new Option('Копить: переработка','processing'),new Option('Копить: монтаж','assembly'));
    this.lock.addEventListener('change',()=>{this.getState().horizon.nextPurchase=(this.lock.value||null) as Machine|null;this.onChange();});settings.append(this.lock);
    const resume=el('button','btn','ВЕРНУТЬ АВТОМОНТАЖ');resume.type='button';resume.addEventListener('click',()=>{const h=this.getState().horizon;h.pinned=false;h.autoBuild=true;this.onChange();});settings.append(resume);
    const machines=el('details','h-production');machines.open=true;machines.append(el('summary','','Производство и улучшения'));
    for(const [id,name] of [['transport','Транспорт'],['processing','Переработка'],['assembly','Монтаж']] as [Machine,string][]){
      const row=el('div','h-machine');const text=el('div','');const buy=el('button','btn');buy.type='button';buy.setAttribute('aria-label',`Улучшить: ${name}`);
      buy.addEventListener('click',()=>{if(buyMachine(this.getState().horizon,id))this.onChange();});row.append(text,buy);this.production.append(row);this.machineRows.set(id,{text,buy});
    }
    this.investAuto.type='button';this.investAuto.addEventListener('click',()=>{const h=this.getState().horizon;h.autoBuy=!h.autoBuy;this.onChange();});
    const investing=el('details','h-invest-why');investing.append(el('summary','','Зачем вкладываться'),el('p','h-note','Выпуск равен меньшей мощности транспорта и переработки. При равенстве нужны оба улучшения: первое создаёт запас мощности, второе увеличивает выпуск. Улучшения сохраняются между залами. Автопокупка тратит КМ на развитие, поэтому текущий монтаж может идти медленнее.'));
    machines.append(this.investment,this.investAuto,this.production,investing);
    const connections=el('details','h-connections-details');connections.append(el('summary','','Помощь прежних слоёв'));
    for(const [id,label] of [['frame','Усиленная рама · 100 лома · монтаж +10%'],['conductor','Проводник · 40 цветмета · линия +10%']] as const){
      const b=el('button','btn',label);b.type='button';b.addEventListener('click',()=>{const s=this.getState();if(connectHorizon(s.horizon,s.bottom,id))this.onChange();});this.connections.append(b);this.connectionRows.set(id,b);
    }
    connections.append(this.connections,el('p','s-why','10 восстановленных улиц дают транспорту +10%, пока город сохраняет их. Подключения необязательны.'));
    this.history.setAttribute('aria-label','Камеры пройденных залов');this.history.addEventListener('change',()=>{this.viewedHall=Number(this.history.value);this.onChange();});
    const targets=el('details','h-targets');targets.append(el('summary','','Осмотреть узлы'),this.nodes);
    this.content.append(this.wallet,this.ume,this.camera.root,this.title,this.recipe,this.routing,this.power,this.commission,this.note,this.nodeText,this.inspection,this.modes,this.allocation,this.allocationNote,this.dispatcher,this.gate,this.umeOrder.root,targets,machines,settings,connections,el('label','h-note','Осмотреть зал'),this.history);
    this.root.append(this.entry,this.firstHall.root,this.content);
  }
  render(s: GameState): void {
    const h=s.horizon;
    if(this.identity!==h){this.identity=h;this.viewedHall=-1;this.renderedHall=-1;this.inspected=null;this.camera.reset();}
    const first=h.open&&h.opened===0&&!!h.firstHall;
    this.entry.hidden=h.open;this.content.hidden=!h.open||first;this.firstHall.root.hidden=!first;
    this.entryText.textContent=`За породой виден стык огромных створок. Глубина ${Math.floor(s.bottom.dug)}/22000 т · проходчик ${s.bottom.equipment.borer>0?'запущен':'не запущен'} · УМЕ переплавкой ${s.bottom.umeMade.gte(1)?'получена':'ещё не получена'}. Вход сохраняет всю шахту.`;
    this.enter.disabled=!canEnterHorizon(s.bottom);if(!h.open)return;
    if(first){this.firstHall.render(s);return;}
    const r=horizonRates(h,s.city), hall=HALLS[h.opened], targets=buildTargets(h);
    this.wallet.textContent=`${format(h.points)} КМ · +${format(r.production.sub(chargeRate(h,s.city)))} КМ/мин`;
    this.ume.textContent=`УМЕ ${format(s.bottom.ume)}`;this.umeOrder.render(s);
    this.title.textContent=hall?`${h.opened+1}/5 · ${hall.name}`:'Главный механизм запущен';
    this.commission.hidden=h.opened!==4;
    if(h.opened===4){this.commissionText.textContent=`ПОДАЧА [${h.finalChecks&1?'OK':'··'}] ─ ПРИВОД [${h.finalChecks&2?'OK':'··'}]${h.trial?` · осталось ${Math.ceil(h.trial.left)} с`:h.finalChecks===3?' · система готова к запуску':''}`;
      this.commissionBar.hidden=!h.trial;if(h.trial)this.commissionBar.value=1-h.trial.left/h.trial.duration;
      for(const [kind,b] of this.commissionButtons){const done=!!(h.finalChecks&(kind==='feed'?1:2));b.disabled=!canCommission(h,kind)||h.points.lt(commissionCost(h,s.city));b.textContent=`${kind==='feed'?'ПРОВЕРИТЬ ПОДАЧУ':'ПРОВЕРИТЬ ПРИВОД'} · ${done?'ГОТОВО':h.trial?.kind===kind?'ИДЁТ ИСПЫТАНИЕ':format(commissionCost(h,s.city))+' КМ'}`;}}
    const powered=h.opened===3&&h.powerMode!=='legacy';this.power.hidden=!powered;
    if(powered){const capacity=powerCapacity(h,s.city);this.powerBar.value=h.charge.div(capacity).min(1).toNumber();this.powerText.textContent=`${format(h.charge)} ЭН · ёмкость ${format(capacity)} · заряд +${format(chargeRate(h,s.city))}/мин. ${h.regulator?'Регулятор запускает полный накопитель автоматически при включённом монтаже.':'Ручной запуск расходует заряд на выбранный доступный узел.'}`;this.powerButtons.forEach((b,id)=>{b.classList.toggle('active',h.powerMode===id);b.setAttribute('aria-pressed',String(h.powerMode===id));});this.pulse.disabled=h.charge.lte(1e-8)||gateReady(h);this.regulator.hidden=h.regulator;this.regulator.disabled=!nodeDone(h,0)||h.points.lt(400);}
    const network=h.opened===2&&h.routing!=='legacy';this.routing.hidden=!network;
    if(network){const shares=routingShares(h,s.city,targets);this.routeNote.textContent=targets.length&&assemblyFlow(h,s.city).gt(0)?`Поток: ${targets.map((id,i)=>`${hall.nodes[id].name} ${Math.round(shares[i]*100)}%`).join(' · ')}.${h.routing==='auto'?' Диспетчер выбирает приоритет по ограничению выпуска и монтажа.':''}`:'Подача на паузе или монтаж завершён.';
      this.routeButtons.forEach((b,id)=>{b.disabled=id==='auto'&&!h.dispatcher;b.classList.toggle('active',h.routing===id);b.setAttribute('aria-pressed',String(h.routing===id));});this.install.hidden=h.dispatcher;this.install.disabled=!nodeDone(h,0)||h.points.lt(200);}
    this.recipe.hidden=h.opened!==1;
    this.recipeText.textContent=h.recipe===null?'Выберите, что собирать первым. От этого зависит монтаж и постоянное усиление следующих залов.':h.recipe==='heavy'?'Крупные узлы: платформа требует на 20% меньше КМ, монтаж усиливает шахта. После запуска транспорт +20%, монтаж +10%.':h.recipe==='precise'?'Точные узлы: силовая линия требует на 30% меньше КМ, монтаж усиливает сортировка. После запуска переработка +20%, выпуск +8%.':'Прежний проект сохранён вместе со вложенным монтажом.';
    for(const [id,row] of this.recipeButtons){row.root.hidden=h.recipe!==null&&h.recipe!==id;row.button.disabled=h.recipe!==null;row.button.classList.toggle('active',h.recipe===id);}
    this.note.textContent=hall?`${hall.reward} · ${h.pinned?'ручная цель':h.autoBuild?'автомонтаж':'выбор цели вручную'}`:'Замкнутый контур работает. Доход свалки постоянно ×1,25. В камерах можно осмотреть все пять залов. За створом видна следующая часть системы.';
    if(this.renderedHall!==h.opened){
      this.renderedHall=h.opened;this.inspected=null;this.nodes.replaceChildren();this.currentButtons=[];
      hall?.nodes.forEach((n,i)=>{const b=el('button','btn h-node',n.name);b.type='button';b.addEventListener('click',()=>{this.inspected=i;this.onChange();});this.nodes.append(b);this.currentButtons.push(b);});
    }
    this.currentButtons.forEach((b,i)=>{
      const done=nodeDone(h,i),active=nodeAvailable(h,i),percent=h.work[i].div(nodeCost(h,i)).mul(100).floor().toNumber();
      b.textContent=`${hall.nodes[i].name} · ${done?'ГОТОВО':active?`${percent}%`:'нужны предыдущие узлы'}`;
      b.classList.toggle('active',targets.includes(i)&&h.mode!=='growth');b.setAttribute('aria-pressed',String(this.inspected===i));
    });
    this.nodeText.textContent=!hall?'Все пять залов открыты.':h.opened===4&&assemblyReady(h)&&h.finalChecks!==3?'Монтаж готов. Завершите проверки подачи и привода, затем передайте 1 УМЕ для запуска.':h.opened===1&&h.recipe===null?'Монтаж ждёт выбора профиля. Оба варианта сохраняют КМ и открытые возможности.':gateReady(h)?'Монтаж завершён. Можно открыть затвор.':h.mode==='growth'?'Монтаж на паузе: режим «Рост» копит весь выпуск КМ.':!h.autoBuild?'Монтаж выключен. Назначьте узел или включите автомонтаж.':`Сейчас строится: ${targets.map(i=>`${hall.nodes[i].name} · ${format(h.work[i])}/${format(nodeCost(h,i))} КМ`).join('; ')}. ${h.mode==='balance'?'До половины выпуска идёт на сборку.':'Сборка использует выпуск и запас КМ.'}`;
    const id=this.inspected,selected=id===null?null:hall?.nodes[id];
    this.inspection.hidden=!selected;
    if(selected&&id!==null){
      this.inspectedText.textContent=`Осмотр: ${selected.name}. ${selected.purpose}. ${format(h.work[id])}/${format(nodeCost(h,id))} КМ.${!nodeAvailable(h,id)&&!nodeDone(h,id)?' Сначала: '+selected.needs.map(i=>hall.nodes[i].name).join(', '):nodeDone(h,id)?' Готово.':''}`;
      this.assign.disabled=!nodeAvailable(h,id);
      this.assign.textContent=h.pinned&&h.selected===id?'НАЗНАЧЕНО · ПОТОМ АВТООЧЕРЕДЬ':'СТРОИТЬ СЛЕДУЮЩИМ';
    }
    this.modes.querySelectorAll('button').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.mode===h.mode));
    this.allocation.hidden=h.opened<2||h.opened>=5||network;
    this.allocation.querySelectorAll('button').forEach(b=>{
      const active=b.dataset.parallel===String(h.parallel);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
    });
    const flow=assemblyFlow(h,s.city);
    this.allocationNote.hidden=!hall||network;
    this.allocationNote.textContent=flow.gt(0)
      ? `Общий монтаж: ${format(flow)} КМ/мин · ${targets.length===2?`два узла по ${format(flow.div(2))}`:'весь поток одному узлу'}.${h.pinned?' Ручная задача до завершения, затем автоочередь.':h.opened>=2&&h.parallel&&targets.length===1?' Сейчас доступен только один узел.':''}`
      : gateReady(h)?'Весь монтаж завершён.':'Мощность монтажа сейчас не расходуется.';
    this.dispatcher.hidden=h.opened<3||h.opened>=5||powered&&h.powerMode==='charge'||h.opened===4&&assemblyReady(h)&&!gateReady(h);
    this.dispatchToggle.textContent=`ДИСПЕТЧЕР · ${h.forecast?'СКРЫТЬ':'ПОКАЗАТЬ'} ПРОГНОЗ`;
    this.dispatchToggle.setAttribute('aria-expanded',String(h.forecast));this.dispatchBody.hidden=!h.forecast;
    if(h.forecast&&h.opened>=3&&hall){
      const prediction=assemblyForecast(h,s.city);
      this.dispatchNext.textContent=prediction?`Ближайшее завершение: ${prediction.next.map(id=>hall.nodes[id].name).join(' + ')} · ${forecastTime(prediction.nextSeconds)}`:gateReady(h)?'Все узлы готовы.':'Прогноз на паузе: включите автомонтаж и режим «Баланс» или «Сборка».';
      this.dispatchFinish.textContent=prediction?`До готовности всего монтажа: ${forecastTime(prediction.totalSeconds)}`:'';
    }
    this.gate.hidden=!gateReady(h);this.gate.textContent=s.bottom.ume.lt(1)?'ЗА УМЕ В ШАХТУ →':'ОТКРЫТЬ · 1 УМЕ';
    const names={transport:'Транспорт',processing:'Переработка',assembly:'Монтаж'};
    const plan=productionPlan(h,s.city);
    this.investment.textContent=plan?`Следующий рост выпуска: ${plan.machines.map(id=>names[id].toLowerCase()).join(' + ')} · ${format(plan.cost)} КМ → +${format(plan.gain)} КМ/мин.${plan.machines.length>1?' Цена за оба звена.':''}`:'Следующий прирост выпуска недоступен при текущих уровнях.';
    this.investAuto.textContent=`АВТОПОКУПКА: ${h.autoBuy?'ВКЛ':'ВЫКЛ'}`;this.investAuto.setAttribute('aria-pressed',String(h.autoBuy));
    for(const [id,row] of this.machineRows){
      const old=r.production;const next=horizonRates({...h, levels:{...h.levels,[id]:h.levels[id]+1}},s.city);
      const gain=id==='assembly'?`монтаж +${format(next.assembly.sub(r.assembly))} КМ/мин`:next.production.gt(old)?`выпуск +${format(next.production.sub(old))} КМ/мин`:`запас мощности · выпуск ограничивает ${id==='transport'?'переработка':'транспорт'}`;
      row.text.textContent=`${names[id]} · ур.${h.levels[id]} · ${format(r[id])} КМ/мин · ${gain}`;
      row.buy.textContent=`${format(machineCost(h,id))} КМ`;row.buy.disabled=h.points.lt(machineCost(h,id));
    }
    this.options.forEach(({input,key})=>{input.checked=h[key];});
    if(document.activeElement!==this.lock)this.lock.value=h.nextPurchase??'';
    this.connectionRows.forEach((b,id)=>{b.disabled=h.connections[id]||s.bottom.money[id==='frame'?'scrap':'nonferrous'].lt(id==='frame'?100:40);b.classList.toggle('active',h.connections[id]);});
    const count=Math.min(5,h.opened+1);
    if(this.history.options.length!==count){this.history.replaceChildren(...HALLS.slice(0,count).map((hall,i)=>new Option(`${i+1}. ${hall.name}`,String(i))));}
    if(document.activeElement!==this.history)this.history.value=String(this.viewedHall>=0?Math.min(this.viewedHall,count-1):Math.min(4,h.opened));
  }
  frame(dt:number,s:GameState):void {
    if(!s.horizon.open)return;
    if(s.horizon.opened===0&&s.horizon.firstHall){this.firstHall.frame(s);return;}
    this.camera.update(dt,{state:s.horizon,hall:this.viewedHall>=0?this.viewedHall:s.horizon.opened,selected:this.inspected??buildTargets(s.horizon)[0]??s.horizon.selected,shares:routingShares(s.horizon,s.city),powerFill:s.horizon.charge.div(powerCapacity(s.horizon,s.city)).min(1).toNumber()});
  }
  focusAssemblyControls(): void {
    const h=this.getState().horizon;
    if(h.opened===0&&h.firstHall){const target=this.firstHall.root.querySelector<HTMLElement>('.lab-actions');target?.scrollIntoView({block:'center'});target?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});return;}
    const target=h.autoBuild?this.modes:this.root.querySelector<HTMLElement>('.h-settings')!;
    if(target instanceof HTMLDetailsElement)target.open=true;
    const control=target.querySelector<HTMLElement>('button, input');
    control?.focus({preventScroll:true});target.scrollIntoView({block:'center'});
  }
}
