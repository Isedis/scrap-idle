import './horizonLab.css';
import { D, format } from '../game/num';
import { deserialize, SAVE_KEY, BACKUP_KEY } from '../game/save';
import { LAB_KEY, LAB_MODULES, LAB_ORDER, EXAMPLE_PROFILE, newLab, profileOf, labRates, labCost, projectAvailable, projectName, startProject, requestShipment, commissionLab, tickLab, serializeLab, deserializeLab, labStage, type LabModule, type LabProject, type LabState, type LabProfile } from '../game/horizonLab';
import { labCamera, pickLabModule } from './horizonLabCam';
import { el } from './dom';

const url=(extra='')=>`?horizon-lab=1${extra}`;
function readProfile():LabProfile {
  try{for(const key of [SAVE_KEY,BACKUP_KEY]){const raw=localStorage.getItem(key),state=raw?deserialize(raw):null;if(state)return profileOf(state);}}catch{/* The example remains playable without storage. */}
  return {...EXAMPLE_PROFILE};
}
const minutes=(seconds:number)=>seconds<60?'<1 мин':`≈${Math.ceil(seconds/60)} мин`;

export function mountHorizonLab(root:HTMLElement):void {
  root.className='lab-root';
  const shell=el('main','lab-shell');root.append(shell);
  const top=el('div','lab-top');top.append(el('span','','УТИЛЬ-ОС / ГОРИЗОНТ'));
  const back=el('a','','К игре ↗');back.href='./';top.append(back);shell.append(top);
  const mode=el('p','lab-mode','Испытание первого зала · отдельный прогресс');shell.append(mode);
  const title=el('h1','','Приёмная галерея');shell.append(title);
  const intro=el('p','lab-intro','Из шахты приходит сырьё. Здесь оно станет деталями машины, размеры которой пока не видны.');shell.append(intro);
  const stage=new URLSearchParams(location.search).get('stage');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(stage==='gallery'){
    mode.textContent='Обзор четырёх состояний · только просмотр';
    const link=el('a','lab-link','Открыть рабочий прототип →');link.href=url();shell.append(link);
    const gallery=el('div','lab-gallery');shell.append(gallery);
    for(const [id,label,note] of [['arrival','01 / Обнаружение','Старый подъёмник и временная линия. Выбираем первую машину.'],['winch','02 / Тяжёлые грузы','Лебёдка уже работает; монтажная тележка устанавливает несущую раму.'],['factory','03 / Работающий цех','Поставки автоматизированы. Пресс выпускает детали, прокладывается силовая линия.'],['commissioned','04 / Первый запуск','Импульс проходит по магистрали. За створом открывается продолжение галереи.']] as const){
      const figure=el('figure','');const state=labStage(id),camera=labCamera(state,label);
      figure.append(camera.root,el('figcaption','',note));gallery.append(figure);
      requestAnimationFrame(()=>camera.draw(state,true));new ResizeObserver(()=>camera.draw(state,true)).observe(camera.canvas);
    }
    return;
  }
  let state:LabState;
  try{state=deserializeLab(localStorage.getItem(LAB_KEY)??'')??newLab(readProfile());}catch{state=newLab(readProfile());}
  const elapsed=Math.max(0,Math.min(7200,(Date.now()-state.lastTick)/1000));if(elapsed>1)tickLab(state,elapsed);
  state.lastTick=Date.now();
  let speed=1,selected:LabModule|null=null;
  const modeCaption=el('span','','Прототип · свой прогресс'),pace=el('select','lab-pace');
  pace.setAttribute('aria-label','Скорость испытания');pace.append(new Option('Время 1×','1'),new Option('Обзор 10×','10'),new Option('Обзор 30×','30'));
  pace.addEventListener('change',()=>{speed=Number(pace.value);render();});mode.replaceChildren(modeCaption,pace);
  const wallet=el('div','lab-wallet'),rate=el('p','lab-rate');shell.append(wallet,rate);
  const camera=labCamera(state);shell.append(camera.root);
  camera.canvas.addEventListener('click',e=>{
    const r=camera.canvas.getBoundingClientRect();selected=pickLabModule((e.clientX-r.left)/r.width*480,(e.clientY-r.top)/r.height*360);render();
  });
  const trace=el('div','lab-trace');trace.setAttribute('aria-label','Путь материалов от шахты к сборке');shell.append(trace);
  const work=el('section','lab-current');const workTitle=el('h2',''),workText=el('p',''),workBar=el('progress','');workBar.max=1;workBar.setAttribute('aria-label','Текущая строительная работа');
  work.append(workTitle,workText,workBar);shell.append(work);
  const inspect=el('p','lab-inspect');shell.append(inspect);
  const delivery=el('section','lab-delivery');const deliveryText=el('p',''),send=el('button','btn','ОТПРАВИТЬ ПАРТИЮ');send.type='button';
  const autoRow=el('label','lab-check'),auto=el('input','');auto.type='checkbox';auto.id='lab-auto-delivery';autoRow.append(auto,document.createTextNode('Автоматические поставки'));
  delivery.append(deliveryText,send,autoRow);
  const actions=el('section','lab-actions');actions.append(el('h2','','Восстановить оборудование'));
  const rows=new Map<LabProject,{root:HTMLElement;note:HTMLElement;button:HTMLButtonElement}>();
  for(const id of [...LAB_ORDER,'gallery'] as LabProject[]){
    const row=el('div','lab-project'),text=el('div',''),name=el('h3','',projectName(id)),note=el('p',''),button=el('button','btn');button.type='button';button.dataset.project=id;
    text.append(name,note);row.append(text,button);actions.append(row);rows.set(id,{root:row,note,button});
    button.addEventListener('click',()=>{if(startProject(state,id)){selected=id==='gallery'?'frame':id;changed();}});
  }
  shell.append(actions,delivery);
  const launch=el('section','lab-launch'),launchText=el('p',''),launchButton=el('button','btn','ПЕРЕДАТЬ ИМПУЛЬС · 1 УМЕ');launchButton.type='button';
  const queueRow=el('label','lab-check'),queue=el('input','');queue.type='checkbox';queue.id='lab-auto-queue';queueRow.append(queue,document.createTextNode('Автоочередь: секции дальней галереи'));
  launch.append(launchText,launchButton,queueRow);shell.append(launch);
  const sources=el('details','lab-sources');sources.append(el('summary','','Откуда приходят материалы'));
  const sourceText=el('p',''),sourceValues=el('div','lab-source-values');sources.append(sourceText,sourceValues);shell.append(sources);
  const controls=el('details','lab-controls');controls.append(el('summary','','Пульт испытаний'));
  const explanation=el('p','','Ускорение действует только в открытом прототипе. При возвращении учитывается до двух часов обычного времени испытания. Сохранение игры и её ресурсы не изменяются.');controls.append(explanation);
  const refresh=el('button','btn','Перечитать снабжение из игры');refresh.type='button';refresh.addEventListener('click',()=>{state.profile=readProfile();changed();});controls.append(refresh);
  const stages=el('a','lab-link','Посмотреть четыре этапа камеры →');stages.href=url('&stage=gallery');controls.append(stages);
  const reset=el('button','btn lab-reset','Начать испытание заново');reset.type='button';reset.addEventListener('click',()=>{state=newLab(readProfile());selected=null;changed();});controls.append(reset);shell.append(controls);
  shell.append(el('p','lab-footer','Первый зал — опытный образец. После запуска можно продолжать изготовление секций. Другие залы пока не входят в это испытание.'));
  const status=el('p','lab-save-status');status.setAttribute('role','status');shell.append(status);

  function persist(){try{localStorage.setItem(LAB_KEY,serializeLab(state));status.textContent='';}catch{status.textContent='Прогресс испытания не записан: хранилище недоступно.';}}
  function changed(){state.lastTick=Date.now();persist();render();}
  send.addEventListener('click',()=>{if(requestShipment(state))changed();});
  auto.addEventListener('change',()=>{if(state.built.frame){state.autoDelivery=auto.checked;changed();}});
  launchButton.addEventListener('click',()=>{if(commissionLab(state))changed();});
  queue.addEventListener('change',()=>{if(state.commissioned){state.autoQueue=queue.checked;changed();}});
  function render(){
    const r=labRates(state);
    modeCaption.textContent='Прототип · свой прогресс';pace.value=String(speed);
    wallet.textContent=`${format(state.km)} КМ`;rate.textContent=`+${format(r.production)} КМ/мин · сырьё ${format(state.raw)}/${format(r.capacity)}`;
    trace.textContent=`ШАХТА ${state.shipment?'══▶':'──▶'} ПОДАЧА ${state.raw.gt(0)?'══▶':'──▶'} ЦЕХ ${state.job?'══▶':'──▶'} МОНТАЖ`;
    const builtCount=LAB_ORDER.filter(id=>state.built[id]).length;
    workTitle.textContent=state.job?`> ${projectName(state.job.id)}`:state.commissioned?'> ГАЛЕРЕЯ ПОД НАГРУЗКОЙ':builtCount?'> СЛЕДУЮЩИЙ УЧАСТОК':'> ВЫБЕРИТЕ ПЕРВЫЙ УЧАСТОК';
    const next=state.built.relay?'Все узлы соединены. Передайте первый импульс.':state.built.frame&&state.built.press?'Цех и снабжение работают. Осталось провести силовую магистраль.':state.built.frame?'Поставки уже идут сами. Пресс увеличит выход материала для дальнейшей сборки.':state.built.winch?'Теперь доступна несущая рама с автоматическими поставками. Можно сначала усилить выпуск прессом.':state.built.press?'Пресс даёт больше деталей. Лебёдка откроет тяжёлые грузы и несущую раму.':'Лебёдка раньше снимет ручное снабжение. Пресс раньше увеличит выпуск. Каждая машина работает после установки.';
    workText.textContent=state.job?`${Math.floor((1-state.job.left/state.job.duration)*100)}% · ${minutes(state.job.left)} работы. Материал для этой стройки уже оплачен.`:state.commissioned?`Машины питают дальнейший монтаж. Построено секций: ${state.gallery}.`:next;
    workBar.hidden=!state.job;if(state.job)workBar.value=1-state.job.left/state.job.duration;
    inspect.hidden=!selected;inspect.textContent=selected?`${LAB_MODULES[selected].name}: ${state.built[selected]?'работает':state.job?.id===selected?'идёт монтаж':LAB_MODULES[selected].effect}`:'';
    send.disabled=!!state.shipment||state.raw.gte(r.capacity);send.textContent=state.shipment?'ПАРТИЯ В ПУТИ':'ОТПРАВИТЬ ПАРТИЮ';
    deliveryText.textContent=state.shipment?`Из шахты: ${format(state.shipment.quantity)} сырья · ${Math.ceil(state.shipment.left)} с пути.`:state.built.frame&&state.autoDelivery?'Снабжение работает автоматически. Лебёдка заказывает партии по мере расхода.':state.raw.eq(0)?'Бункер пуст. Пока идёт новый груз, старый верстак даёт 1 КМ/мин.':`Партия ${format(r.payload)} сырья · ${Math.ceil(r.tripSeconds)} с пути. Пока идёт монтаж, можно заказать следующую поставку.`;
    autoRow.hidden=!state.built.frame;auto.checked=state.autoDelivery;
    for(const [id,row] of rows){
      const done=id!=='gallery'&&state.built[id],available=projectAvailable(state,id);
      row.root.hidden=done||(!available&&state.job?.id!==id);
      row.note.textContent=id==='gallery'?`Подача ещё ×1,12 и бункер +4. Следующая секция: ${state.gallery+1}.`:LAB_MODULES[id].effect;
      row.button.textContent=state.job?.id===id?'МОНТАЖ':`${format(labCost(state,id))} КМ`;
      row.button.disabled=!!state.job||!available||state.km.lt(labCost(state,id));
    }
    actions.hidden=LAB_ORDER.every(id=>state.built[id])&&!state.commissioned;
    launch.hidden=!state.built.relay;
    launchText.textContent=state.commissioned?'Первый запуск состоялся. Автоочередь может повторять изготовление секций; её можно остановить в любой момент.':'Все четыре узла соединены. Для испытания выдан один отдельный импульс УМЕ. Он не берётся из кошелька основной игры.';
    launchButton.hidden=state.commissioned;queueRow.hidden=!state.commissioned;queue.checked=state.autoQueue;
    sourceText.textContent=state.profile.source==='save'?'Снабжение рассчитано по копии вашего игрового сохранения. Ресурсы остаются в игре.':'Используется пример развитого полигона: игровое сохранение пока не найдено.';
    const lines=[`Свалка → размер партии: ${format(r.payload)} сырья.`,`Сортировка → выход: ${format(r.yieldPerRaw)} КМ из единицы сырья.`,`Город → доставка: ${Math.ceil(r.tripSeconds)} с вместе с подъёмом из шахты.`,`Дно → монтаж: ×${format(D(r.crew))}.`];
    const sourceKey=lines.join('\n');if(sourceValues.textContent!==sourceKey)sourceValues.textContent=sourceKey;
  }
  render();persist();
  let last=Date.now(),lastRender=0;
  function frame(){
    const now=Date.now(),gap=Math.max(0,(now-last)/1000);last=now;
    tickLab(state,gap>5?Math.min(gap,7200):gap*speed);state.lastTick=now;
    if(now-lastRender>100){render();lastRender=now;}
    camera.draw(state,reduced,selected);requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);setInterval(persist,5000);
  addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
}
