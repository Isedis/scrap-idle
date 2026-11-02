import { format } from '../game/num';
import { HALLS, canEnterHorizon, enterHorizon, openGate, nodeAvailable, nodeCost, nodeDone, gateReady, horizonRates, machineCost, productionPlan, buyMachine, connectHorizon, buildTargets, type Machine, type BuildMode } from '../game/horizon';
import type { GameState } from '../game/state';
import { el } from './dom';
import { HorizonCam } from './horizonCam';
import { UmeOrder } from './umeOrder';

export class HorizonPanel {
  readonly root = el('section', 'panel horizon');
  readonly camera: HorizonCam;
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
  private gate = el('button', 'btn h-gate', 'ОТКРЫТЬ · 1 УМЕ');
  private note = el('div', 'h-note');
  private history = el('select', 'h-select');
  private lock = el('select', 'h-select');
  private production = el('div', 'h-machines');
  private investment = el('p', 'h-note h-investment');
  private investAuto = el('button', 'btn h-invest-auto');
  private machineRows = new Map<Machine, { text: HTMLElement; buy: HTMLButtonElement }>();
  private options: { input: HTMLInputElement; key: 'autoBuild' | 'autoBuy' | 'smart' | 'reserveUme' }[] = [];
  private connections = el('div', 'h-connections');
  private connectionRows = new Map<'frame'|'conductor', HTMLButtonElement>();
  private renderedHall = -1;
  private viewedHall = -1;
  private identity: GameState['horizon'] | null = null;
  private currentButtons: HTMLButtonElement[] = [];
  constructor(private getState: () => GameState, private onChange: () => void, private visitMine: () => void) {
    this.umeOrder=new UmeOrder(getState,onChange);
    this.camera = new HorizonCam(i => {
      const h = this.getState().horizon;
      if (this.viewedHall >= 0 && this.viewedHall !== h.opened) return;
      this.inspected = i; this.onChange();
    });
    this.enter.type = 'button'; this.enter.addEventListener('click', () => { const s = this.getState(); if (enterHorizon(s.horizon, s.bottom)) this.onChange(); });
    this.entry.append(el('h2', 'panel-title', 'Металлический стык'), this.entryText, this.enter);
    for (const [id, label] of [['growth','РОСТ'],['balance','БАЛАНС'],['assembly','СБОРКА']] as [BuildMode,string][]) {
      const b=el('button','btn',label);b.type='button';b.dataset.mode=id;
      b.addEventListener('click',()=>{this.getState().horizon.mode=id;this.onChange();});this.modes.append(b);
    }
    this.gate.type='button';this.gate.addEventListener('click',()=>{
      const s=this.getState();const old=s.horizon.opened;
      if(gateReady(s.horizon)&&s.bottom.ume.lt(1)){this.visitMine();return;}
      if(openGate(s.horizon,s.bottom)){this.viewedHall=-1;this.inspected=null;this.camera.opened(old);this.onChange();}
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
    for(const [key,label] of [['autoBuild','Автомонтаж'],['autoBuy','Автопокупка полезных улучшений'],['smart','Диспетчер зависимостей · после зала 3'],['reserveUme','Копить 1 УМЕ на текущий затвор']] as const){
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
    this.content.append(this.wallet,this.ume,this.camera.root,this.title,this.note,this.nodeText,this.inspection,this.modes,this.gate,this.umeOrder.root,targets,machines,settings,connections,el('label','h-note','Осмотреть зал'),this.history);
    this.root.append(this.entry,this.content);
  }
  render(s: GameState): void {
    const h=s.horizon;
    if(this.identity!==h){this.identity=h;this.viewedHall=-1;this.renderedHall=-1;this.inspected=null;this.camera.reset();}
    this.entry.hidden=h.open;this.content.hidden=!h.open;
    this.entryText.textContent=`За породой виден стык огромных створок. Глубина ${Math.floor(s.bottom.dug)}/22000 т · проходчик ${s.bottom.equipment.borer>0?'запущен':'не запущен'} · УМЕ переплавкой ${s.bottom.umeMade.gte(1)?'получена':'ещё не получена'}. Вход сохраняет всю шахту.`;
    this.enter.disabled=!canEnterHorizon(s.bottom);if(!h.open)return;
    const r=horizonRates(h,s.city), hall=HALLS[h.opened], targets=buildTargets(h);
    this.wallet.textContent=`${format(h.points)} КМ · +${format(r.production)} КМ/мин`;
    this.ume.textContent=`УМЕ ${format(s.bottom.ume)}`;this.umeOrder.render(s);
    this.title.textContent=hall?`${h.opened+1}/5 · ${hall.name}`:'Глава завершена · сопряжение';
    this.note.textContent=hall?`${hall.reward} · ${h.pinned?'ручная цель':h.autoBuild?'автомонтаж':'выбор цели вручную'}`:'За главным створом — неподключённая система. Следующая глава ещё не открыта. Производство и прежние залы сохранены.';
    if(this.renderedHall!==h.opened){
      this.renderedHall=h.opened;this.inspected=null;this.nodes.replaceChildren();this.currentButtons=[];
      hall?.nodes.forEach((n,i)=>{const b=el('button','btn h-node',n.name);b.type='button';b.addEventListener('click',()=>{this.inspected=i;this.onChange();});this.nodes.append(b);this.currentButtons.push(b);});
    }
    this.currentButtons.forEach((b,i)=>{
      const done=nodeDone(h,i),active=nodeAvailable(h,i),percent=h.work[i].div(nodeCost(h,i)).mul(100).floor().toNumber();
      b.textContent=`${hall.nodes[i].name} · ${done?'ГОТОВО':active?`${percent}%`:'нужны предыдущие узлы'}`;
      b.classList.toggle('active',targets.includes(i)&&h.mode!=='growth');b.setAttribute('aria-pressed',String(this.inspected===i));
    });
    this.nodeText.textContent=!hall?'Все пять залов открыты.':gateReady(h)?'Монтаж завершён. Можно открыть затвор.':h.mode==='growth'?'Монтаж на паузе: режим «Рост» копит весь выпуск КМ.':!h.autoBuild?'Монтаж выключен. Назначьте узел или включите автомонтаж.':`Сейчас строится: ${targets.map(i=>`${hall.nodes[i].name} · ${format(h.work[i])}/${format(nodeCost(h,i))} КМ`).join('; ')}. ${h.mode==='balance'?'До половины выпуска идёт на сборку.':'Сборка использует выпуск и запас КМ.'}`;
    const id=this.inspected,selected=id===null?null:hall?.nodes[id];
    this.inspection.hidden=!selected;
    if(selected&&id!==null){
      this.inspectedText.textContent=`Осмотр: ${selected.name}. ${selected.purpose}. ${format(h.work[id])}/${format(nodeCost(h,id))} КМ.${!nodeAvailable(h,id)&&!nodeDone(h,id)?' Сначала: '+selected.needs.map(i=>hall.nodes[i].name).join(', '):nodeDone(h,id)?' Готово.':''}`;
      this.assign.disabled=!nodeAvailable(h,id);
      this.assign.textContent=h.pinned&&h.selected===id?'НАЗНАЧЕНО · ПОТОМ АВТООЧЕРЕДЬ':'СТРОИТЬ СЛЕДУЮЩИМ';
    }
    this.modes.querySelectorAll('button').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.mode===h.mode));
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
    this.options.forEach(({input,key})=>{input.checked=h[key];input.disabled=key==='smart'&&h.opened<3;});
    if(document.activeElement!==this.lock)this.lock.value=h.nextPurchase??'';
    this.connectionRows.forEach((b,id)=>{b.disabled=h.connections[id]||s.bottom.money[id==='frame'?'scrap':'nonferrous'].lt(id==='frame'?100:40);b.classList.toggle('active',h.connections[id]);});
    const count=Math.min(5,h.opened+1);
    if(this.history.options.length!==count){this.history.replaceChildren(...HALLS.slice(0,count).map((hall,i)=>new Option(`${i+1}. ${hall.name}`,String(i))));}
    if(document.activeElement!==this.history)this.history.value=String(this.viewedHall>=0?Math.min(this.viewedHall,count-1):Math.min(4,h.opened));
  }
  frame(dt:number,s:GameState):void {
    if(!s.horizon.open)return;
    this.camera.update(dt,{state:s.horizon,hall:this.viewedHall>=0?this.viewedHall:s.horizon.opened,selected:this.inspected??buildTargets(s.horizon)[0]??s.horizon.selected});
  }
  focusAssemblyControls(): void {
    const h=this.getState().horizon;
    const target=h.autoBuild?this.modes:this.root.querySelector<HTMLElement>('.h-settings')!;
    if(target instanceof HTMLDetailsElement)target.open=true;
    const control=target.querySelector<HTMLElement>('button, input');
    control?.focus({preventScroll:true});target.scrollIntoView({block:'center'});
  }
}
