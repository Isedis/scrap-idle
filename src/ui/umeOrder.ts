import { canOrderUme, requestUme, settleUmeOrder, umeOrderShortfall } from '../game/horizon';
import { meltCost } from '../game/bottom';
import { format } from '../game/num';
import type { GameState } from '../game/state';
import { el } from './dom';

/** Same one-shot order on both sides of the mine/gate link. */
export class UmeOrder {
  readonly root=el('div','ume-order');
  private note=el('p','ume-order-note');
  private reserve=el('p','ume-order-note');
  private button=el('button','btn ume-order-button');
  constructor(private getState:()=>GameState,private onChange:()=>void){
    this.button.type='button';this.button.addEventListener('click',()=>{
      const s=this.getState();
      if(s.horizon.umeOrder)s.horizon.umeOrder=false;
      else if(requestUme(s.horizon,s.bottom))settleUmeOrder(s.horizon,s.bottom);
      this.onChange();
    });
    this.root.append(this.reserve,this.note,this.button);
  }
  render(s:GameState):void{
    const h=s.horizon,b=s.bottom;
    const ordering=h.umeOrder||canOrderUme(h,b),reserve=h.open&&h.opened<5&&h.reserveUme;
    this.root.hidden=!ordering&&!reserve;
    this.reserve.hidden=!reserve;this.note.hidden=!ordering;this.button.hidden=!ordering;
    this.reserve.textContent=`На затвор: ${format(b.ume.min(1))}/1 УМЕ. Ручная покупка проходчика может их потратить.`;
    this.button.setAttribute('aria-pressed',String(h.umeOrder));
    this.button.textContent=h.umeOrder?'ОТМЕНИТЬ ПОРУЧЕНИЕ':'ПОЛУЧИТЬ 1 УМЕ ДЛЯ ЗАТВОРА';
    this.note.textContent=h.umeOrder
      ? `Поручено: одна УМЕ. Нужно ещё ${format(umeOrderShortfall(b).ceil())} аномалий из избытка.${b.route==='seam'?' Жила работает.':' Для гарантированной добычи выберите «К жиле». '}`
      : `Разово: ${meltCost(b,'anomaly')} аномалий из избытка → 1 УМЕ. Резерв выбранной покупки сохраняется; маршрут не меняется.`;
  }
}
