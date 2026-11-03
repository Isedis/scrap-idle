import './horizonLab.css';
import { D, format } from '../game/num';
import { LAB_MODULES, LAB_ORDER, labRates, labCost, projectAvailable, newLab, type LabModule } from '../game/horizonLab';
import { buildFirstHall, supplyFirstHall, openGate, gateReady } from '../game/horizon';
import type { GameState } from '../game/state';
import { labCamera, pickLabModule } from './horizonLabCam';
import { UmeOrder } from './umeOrder';
import { el } from './dom';

/** Live first hall: no independent storage, clock, currency or trial UME. */
export class HorizonFirstHall {
  readonly root=el('div','h-first lab-root');
  private wallet=el('div','lab-wallet');
  private rate=el('p','lab-rate');
  private trace=el('div','lab-trace');
  private work=el('section','lab-current');
  private workTitle=el('h2','');
  private workText=el('p','');
  private progress=el('progress','');
  private actions=el('section','lab-actions');
  private delivery=el('section','lab-delivery');
  private deliveryText=el('p','');
  private send=el('button','btn','ОТПРАВИТЬ ПАРТИЮ');
  private autoRow=el('label','lab-check');
  private auto=el('input','');
  private legacyRow=el('label','lab-check');
  private legacy=el('input','');
  private inspect=el('p','lab-inspect');
  private gate=el('button','btn h-gate','ЗАПУСТИТЬ ГАЛЕРЕЮ · 1 УМЕ');
  private sources=el('details','lab-sources');
  private sourceText=el('div','lab-source-values');
  private camera:ReturnType<typeof labCamera>;
  private order:UmeOrder;
  private selected:LabModule|null=null;
  private rows=new Map<LabModule,{root:HTMLElement;note:HTMLElement;button:HTMLButtonElement}>();
  private identity:GameState['horizon']|null=null;
  constructor(private getState:()=>GameState,private changed:()=>void,private visitMine:()=>void){
    const h=getState().horizon;
    // The canvas is attached before entry; its drawing state comes from the live save on every frame.
    this.camera=labCamera(h.firstHall??newLab());
    this.camera.canvas.addEventListener('click',e=>{const r=this.camera.canvas.getBoundingClientRect();this.selected=pickLabModule((e.clientX-r.left)/r.width*480,(e.clientY-r.top)/r.height*360);this.render(this.getState());});
    this.progress.max=1;this.progress.setAttribute('aria-label','Монтаж оборудования');
    this.work.append(this.workTitle,this.workText,this.progress);
    this.actions.append(el('h2','','Восстановить оборудование'));
    for(const id of LAB_ORDER){const root=el('div','lab-project'),text=el('div',''),note=el('p',''),button=el('button','btn');button.type='button';button.dataset.firstProject=id;
      text.append(el('h3','',LAB_MODULES[id].name),note);root.append(text,button);this.actions.append(root);this.rows.set(id,{root,note,button});
      button.addEventListener('click',()=>{if(buildFirstHall(this.getState().horizon,id))this.changed();});
    }
    this.send.type='button';this.send.addEventListener('click',()=>{if(supplyFirstHall(this.getState().horizon))this.changed();});
    this.auto.type='checkbox';this.autoRow.append(this.auto,document.createTextNode('Автоматические поставки'));
    this.auto.addEventListener('change',()=>{const f=this.getState().horizon.firstHall;if(f?.built.frame){f.autoDelivery=this.auto.checked;this.changed();}});
    this.legacy.type='checkbox';this.legacyRow.append(this.legacy,document.createTextNode('Продолжать ранее открытый автомонтаж'));
    this.legacy.addEventListener('change',()=>{const h=this.getState().horizon;h.autoBuild=this.legacy.checked;if(h.autoBuild&&h.mode==='growth')h.mode='balance';this.changed();});
    this.delivery.append(this.deliveryText,this.send,this.autoRow,this.legacyRow);
    this.gate.type='button';this.gate.addEventListener('click',()=>{const s=this.getState();if(!gateReady(s.horizon))return;if(s.bottom.ume.lt(1)){this.visitMine();return;}if(openGate(s.horizon,s.bottom))this.changed();});
    this.sources.append(el('summary','','Как помогают прежние слои'),this.sourceText);
    this.order=new UmeOrder(getState,changed);
    this.root.append(this.wallet,this.rate,this.camera.root,el('h2','panel-title','1/5 · Приёмная галерея'),this.trace,this.work,this.inspect,this.actions,this.delivery,this.gate,this.order.root,this.sources);
  }
  render(s:GameState):void {
    const h=s.horizon,f=h.firstHall;if(!f)return;
    if(this.identity!==h){this.identity=h;this.selected=null;}
    const r=labRates(f);this.wallet.textContent=`${format(h.points)} КМ`;
    this.rate.textContent=`+${format(r.production)} КМ/мин · сырьё ${format(f.raw)}/${format(r.capacity)} · УМЕ ${format(s.bottom.ume)}`;
    this.trace.textContent=`ШАХТА ${f.shipment?'══▶':'──▶'} ПОДАЧА ${f.raw.gt(0)?'══▶':'──▶'} ЦЕХ ${f.job?'══▶':'──▶'} МОНТАЖ`;
    this.workTitle.textContent=f.job?`> ${LAB_MODULES[f.job.id as LabModule]?.name??'Монтаж'}`:gateReady(h)?'> ВСЕ МАШИНЫ СОЕДИНЕНЫ':'> СЛЕДУЮЩИЙ УЧАСТОК';
    this.workText.textContent=f.job?`${Math.floor((1-f.job.left/f.job.duration)*100)}% · осталось ${Math.ceil(f.job.left)} с. Материал уже оплачен; производство продолжается.`:gateReady(h)?'Передайте импульс УМЕ, чтобы открыть проход в следующий зал. Шахта продолжает работать.':f.built.frame?'Снабжение автоматизировано. Соберите пресс и силовую магистраль.':f.built.winch?'Рама откроет автопоставки. Пресс увеличит выход КМ из сырья.':f.built.press?'Пресс уже увеличивает выпуск. Лебёдка откроет тяжёлые грузы и раму.':'Лебёдка раньше снимет ручное снабжение. Пресс раньше увеличит выпуск. Выберите первую машину.';
    this.progress.hidden=!f.job;if(f.job)this.progress.value=1-f.job.left/f.job.duration;
    this.inspect.hidden=!this.selected;this.inspect.textContent=this.selected?`${LAB_MODULES[this.selected].name}: ${f.built[this.selected]?'работает':LAB_MODULES[this.selected].effect}`:'';
    for(const [id,row] of this.rows){const available=projectAvailable(f,id);row.root.hidden=f.built[id]||(!available&&f.job?.id!==id);row.note.textContent=LAB_MODULES[id].effect.replace('автоочередь секций','автомонтаж следующего зала');row.button.textContent=f.job?.id===id?'МОНТАЖ':`${format(labCost(f,id))} КМ`;row.button.disabled=!!f.job||!available||h.points.lt(labCost(f,id));}
    this.actions.hidden=gateReady(h);
    this.send.disabled=!!f.shipment||f.raw.gte(r.capacity);this.send.textContent=f.shipment?'ПАРТИЯ В ПУТИ':'ОТПРАВИТЬ ПАРТИЮ';
    this.deliveryText.textContent=f.shipment?`Из шахты: ${format(f.shipment.quantity)} сырья · ${Math.ceil(f.shipment.left)} с пути.`:f.built.frame&&f.autoDelivery?'Лебёдка заказывает грузы автоматически по мере расхода.':f.raw.eq(0)?'Бункер пуст. Старый верстак продолжает давать 1 КМ/мин. Закажите груз.':`Следующая партия: ${format(r.payload)} сырья · ${Math.ceil(r.tripSeconds)} с пути.`;
    this.autoRow.hidden=!f.built.frame;this.auto.checked=f.autoDelivery;
    this.legacyRow.hidden=!h.legacyAutomation;this.legacy.checked=h.autoBuild&&h.mode!=='growth';
    this.gate.hidden=!gateReady(h);this.gate.textContent=s.bottom.ume.lt(1)?'ЗА УМЕ В ШАХТУ →':'ЗАПУСТИТЬ ГАЛЕРЕЮ · 1 УМЕ';this.order.render(s);
    this.sourceText.textContent=`Свалка → партия ${format(r.payload)} сырья.\nСортировка → ${format(r.yieldPerRaw)} КМ из единицы сырья.\nГород → путь груза ${Math.ceil(r.tripSeconds)} с вместе с подъёмом.\nДно → монтаж ×${format(D(r.crew))}.\nПоказатели обновляются по ходу игры. Верхние кошельки не расходуются.`;
    this.frame(s);
  }
  frame(s:GameState):void {if(s.horizon.firstHall)this.camera.draw(s.horizon.firstHall,matchMedia('(prefers-reduced-motion: reduce)').matches,this.selected);}
}
