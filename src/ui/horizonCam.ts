import { type HorizonState } from '../game/horizon';
import { Camera } from './camera';
import { drawLab } from './horizonLabCam';
import { drawWorks,pickWork,WORK_REGIONS,type WorksView } from './horizonWorksCam';

export const NODE_POSITIONS=WORK_REGIONS.map(regions=>regions.map(([x,y,w,h])=>[x+w/2,y+h/2]));
export class HorizonCam extends Camera<WorksView> {
  private opening=0;
  private previous=0;
  private powerKick=0;
  private shots=0;
  private lastFrame=0;
  private identity:HorizonState|null=null;
  constructor(onPick:(index:number)=>void){
    super('КАМ-10 · ГОРИЗОНТ','Промышленный зал: выберите машину для осмотра');
    this.root.classList.add('horizon-camera');this.lurks=false;
    this.canvas.addEventListener('click',e=>{
      if(!this.view||this.opening>0||this.view.hall!==this.view.state.opened)return;
      const r=this.canvas.getBoundingClientRect();
      const id=pickWork(this.view.hall,(e.clientX-r.left)/r.width*480,(e.clientY-r.top)/r.height*360);
      if(id!==null)onPick(id);
    });
  }
  protected onResize():void {const ratio=Math.min(2,window.devicePixelRatio||1);this.canvas.width=Math.round(this.w*ratio);this.canvas.height=Math.round(this.h*ratio);}
  opened(hall:number):void {this.previous=hall;this.opening=this.reducedMotion?0:5;}
  reset():void {this.opening=0;this.powerKick=0;this.identity=null;this.lastFrame=0;}
  protected simulate(dt:number):void {
    this.opening=Math.max(0,this.opening-dt);this.powerKick=Math.max(0,this.powerKick-dt);
    const state=this.view?.state,now=performance.now();
    if(state){if(this.identity===state&&this.lastFrame>0&&now-this.lastFrame<400&&state.powerShots>this.shots)this.powerKick=1.2;this.shots=state.powerShots;this.identity=state;}
    this.lastFrame=now;
  }
  protected draw():void {
    const v=this.view!,hall=this.opening>0?this.previous:Math.min(4,v.hall);
    if(hall===0&&v.state.firstHall){drawLab(this.ctx,v.state.firstHall,this.canvas.width,this.canvas.height,true);return;}
    const door=hall<v.state.opened?(this.opening>0?(5-this.opening)/5:1):0;
    drawWorks(this.ctx,{...v,hall},this.canvas.width,this.canvas.height,this.t,this.reducedMotion,door,this.powerKick);
  }
}
