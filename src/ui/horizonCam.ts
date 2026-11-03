import { HALLS, buildTargets, nodeCost, type HorizonState } from '../game/horizon';
import { Camera } from './camera';
import { drawLab } from './horizonLabCam';

export const NODE_POSITIONS = [
  [[180,190],[70,123],[290,123],[180,64]],
  [[95,192],[180,148],[284,114],[180,65]],
  [[180,186],[72,111],[289,111],[180,65]],
  [[180,185],[180,123],[290,121],[180,62]],
  [[180,195],[75,134],[285,134],[180,82],[180,50]],
];
interface HorizonView { state: HorizonState; hall: number; selected: number }
export class HorizonCam extends Camera<HorizonView> {
  private opening = 0;
  private previous = 0;
  constructor(onPick: (index: number) => void) {
    super('КАМ-10 · ГОРИЗОНТ', 'Затвор нижнего горизонта: выберите привод в камере');
    this.root.classList.add('horizon-camera'); this.lurks = false;
    this.canvas.addEventListener('click', (e) => {
      if (!this.view || this.opening > 0) return;
      if(this.view.hall===0&&this.view.state.firstHall)return;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width * 360, y = (e.clientY - rect.top) / rect.height * 240;
      const positions = NODE_POSITIONS[Math.min(4, this.view.hall)];
      const nearest = positions.map(([px,py], i) => ({ i, d: Math.hypot(px-x,py-y) })).sort((a,b) => a.d-b.d)[0];
      if (nearest.d < 40) onPick(nearest.i);
    });
  }
  opened(hall: number): void { this.previous = hall; this.opening = this.reducedMotion ? 0 : 5; }
  reset(): void { this.opening = 0; }
  protected simulate(dt: number): void { this.opening = Math.max(0, this.opening-dt); }
  protected draw(): void {
    const { ctx, w, h } = this; const v = this.view!;
    const index = this.opening > 0 ? this.previous : Math.min(4, v.hall);
    if(index===0&&v.state.firstHall){drawLab(ctx,v.state.firstHall,w,h,true);return;}
    const archived = index < v.state.opened;
    const progress = Math.max(0, Math.min(1, (5-this.opening)/5));
    ctx.save(); ctx.scale(w/360,h/240);
    const box=(x:number,y:number,a:number,b:number,c:string)=>{ctx.fillStyle=c;ctx.fillRect(x,y,a,b);};
    const line=(x:number,y:number,a:number,b:number,c:string,width=1)=>{ctx.strokeStyle=c;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();};
    box(0,0,360,240,'#030b08');
    // Receding ribs and small lights establish scale before machinery is installed.
    for(let i=4;i>=0;i--){const d=i*13;box(24+d,29+d,312-d*2,187-d*1.8,'#0b1b15');ctx.strokeStyle='#284634';ctx.lineWidth=3;ctx.strokeRect(24+d,29+d,312-d*2,187-d*1.8);}
    const light=ctx.createRadialGradient(180,90,5,180,120,160);light.addColorStop(0,'rgba(110,150,108,.12)');light.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=light;ctx.fillRect(0,20,360,220);
    for(let i=0;i<12;i++){const x=20+i*29;line(x,211,180+(x-180)*.6,175,'#233f2d');}
    box(22,202,316,8,'#2b4432');box(22,202,316,2,'#5c7457');
    const gap=this.opening>0?progress*62:archived?62:0;
    // Different architectural silhouettes for each chamber.
    if(index===3){ctx.strokeStyle='#3f6049';ctx.lineWidth=10;ctx.beginPath();ctx.ellipse(180,124,91,83,0,0,Math.PI*2);ctx.stroke();}
    const top=index===1?42:55, floor=194;
    box(112-gap,top,66,floor-top,'#253c2c');box(182+gap,top,66,floor-top,'#203728');
    for(let y=top+8;y<floor;y+=17){line(116-gap,y,173-gap,y,'#3f5940');line(186+gap,y,243+gap,y,'#364e39');}
    line(178-gap,top,178-gap,floor,'#7a8b64',2);line(182+gap,top,182+gap,floor,'#5f7859',2);
    if(gap>2){box(178-gap,top,4+gap*2,floor-top,'#010705');for(let i=0;i<6;i++){box(178-gap+8+i*gap*.28,top+17+i*10,2,2,'#aab18a');}}
    const positions=NODE_POSITIONS[index];
    positions.forEach(([x,y],i)=>{
      const p=archived?1:Math.min(1,v.state.work[i]?.div(nodeCost(v.state,i)).toNumber()??0);
      const color=p>=1?'#8d9b71':p>0?'#5b7959':'#263e2e';
      // Foundations, motor housings and physical connecting rods share a consistent footprint.
      if(i===0){box(x-47,y-4,94,2,'#304b36');box(x-47,y-4,94*p,9,color);for(let j=0;j<Math.floor(p*5);j++)box(x-43+j*20,y+5,5,6,'#456247');}
      else {
        box(x-14,y+10,28,3,'#2c4934');
        if(p>0){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.strokeRect(x-13,y-12,26,24);}
        if(p>=.25){box(x-12,y,24,11,color);}
        if(p>=.5){box(x-11,y-10,22,20,color);box(x-8,y-7,16,12,'#10271b');}
        if(p>=.75)line(x,y,x<180?112:x>180?248:180,y,'#597753',3);
        if(p>0)box(x-8,y+9,16*p,3,'#99a77b');
      }
      if(p>=.5){const phase=this.reducedMotion||p<1?0:Math.sin(this.t*(1+i))*.12;line(x-6,y-4,x+6*Math.cos(phase),y+4,'#9bab82',2);}
      if(v.selected===i && !archived){ctx.strokeStyle='#c4b373';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.strokeRect(x-18,y-17,36,34);ctx.setLineDash([]);}
      if(p===1 && i>0)box(x+8,y-10,3,3,'#aed694');
    });
    // Long runs of cable connect completed equipment instead of floating status icons.
    const wired=archived||(v.state.work[positions.length-1]?.gt(0)??false);
    if(wired)for(let i=1;i<positions.length;i++){const [x,y]=positions[i];line(x,y-15,x,47,'#36563c');line(x,47,180,47,'#36563c');}
    // Production installations expand in place; high levels keep a readable capped silhouette.
    const segments=Math.min(6,1+Math.floor(v.state.levels.transport/2));
    box(38,195,65,3,'#49684b');
    for(let i=0;i<segments;i++){
      box(39+i*10,190,7,4,'#6d825f');line(42+i*10,198,42+i*10,202,'#38553e');
    }
    const pressWidth=16+Math.min(4,v.state.levels.processing)*3;
    box(302,174,pressWidth,26,'#304e38');box(305,178,pressWidth-6,16,'#0d2117');
    const stroke=this.reducedMotion?3:(1+Math.sin(this.t*1.7))*3;
    box(305,179+stroke,pressWidth-6,3,'#78906a');
    for(let i=0;i<3;i++){
      const material=this.reducedMotion?i/3:(this.t*.10+i/3)%1;
      box(303+material*29,198,3,2,'#9caa7d');
    }
    const assembling=!archived&&v.state.mode!=='growth'&&buildTargets(v.state).length>0;
    const phase=this.reducedMotion||!assembling ? .5 :(this.t*.08)%1;
    const tx=52+phase*32;box(tx,190,17,9,'#6b8060');box(tx+3,199,4,3,'#314c35');box(tx+12,199,4,3,'#314c35');line(tx+8,190,tx+14,177,'#899a77',2);
    if(index===1){line(96,194,96,88,'#5d7556',2);line(264,194,264,88,'#5d7556',2);box(139,153,82,5,'#45654b');}
    if(index===4){for(const x of [46,302]){box(x,46,11,153,'#39563d');line(x,80,x<180?112:248,55,'#587551',4);}}
    if(index>0){box(27,178,18,24,'#010704');line(26,176,46,176,'#829275',2);line(26,176,26,202,'#526e50',2);line(46,176,46,202,'#526e50',2);}
    if(index===2){line(69,132,95,166,'#426245',3);line(291,132,265,166,'#426245',3);line(95,166,265,166,'#36563e',3);}
    // The next layer is only a distant physical connection, never an actionable fake gate.
    if(v.state.opened===5 && v.hall>=4 && this.opening===0){ctx.strokeStyle='#81927a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(180,124,24,0,Math.PI*2);ctx.stroke();line(180,100,180,148,'#657d67');}
    box(0,222,360,18,'#041009');ctx.font='8px monospace';ctx.fillStyle='#8ca583';ctx.textAlign='left';ctx.fillText(this.opening>0?'ПРОХОД ПОДГОТОВЛЕН':archived?'ЗАТВОР ОТКРЫТ':HALLS[index].name.toUpperCase(),12,234);ctx.textAlign='right';ctx.fillText(`${index+1} / 5`,347,234);
    ctx.restore();this.vignette(.28);
  }
}
