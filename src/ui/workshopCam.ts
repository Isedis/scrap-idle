import { Camera } from './camera';
import { C } from './scene';
import { UPGRADES, upgradeById } from '../game/upgrades';
import { PRODUCERS } from '../game/producers';
import { trackById } from '../game/infinite';

export interface WorkshopView {
  upgrades: readonly string[];
  compact: number;
  bulk: number;
  dark: number;
  threat: number;
}

type WorkshopAnomaly = 'press' | 'stock' | 'contract';
/** Only purchased stations can misbehave, and only once the real threat is high. */
export function workshopAnomalies(view: WorkshopView): WorkshopAnomaly[] {
  if (view.threat < 0.6) return [];
  const options: WorkshopAnomaly[] = [];
  if (view.compact > 0) options.push('press');
  if (view.bulk > 0) options.push('stock');
  if (view.dark > 0) options.push('contract');
  return options;
}
const ANOMALY_TEXT: Record<WorkshopAnomaly, string> = {
  press: 'КАМ-05: ТЮК ДАВИТ НА ПЛИТУ ИЗНУТРИ',
  stock: 'КАМ-05: В ПОСТАВКЕ ЧТО-ТО РАСПРАВЛЯЕТСЯ',
  contract: 'КАМ-05: НОВАЯ СТРОКА. НИКТО НЕ ПИСАЛ',
};

const LABELS = ['СБОР', 'ТЕЛЕЖКИ', 'ВЫВОЗ', 'ЛИНИЯ', 'ПРЕСС', 'ЗАВОД', 'ПОЛИГОН', 'ТЭЦ', 'ОРБИТА', 'СИНГУЛ.'];
/** Real upgrade ids, rather than a row filled by the aggregate purchase count. */
export function workshopInventory(ids: readonly string[]) {
  const owned = new Set(ids);
  const count = (kind: 'global' | 'synergy') => {
    const defs = UPGRADES.filter(u => u.effect.kind === kind);
    return { bought: defs.filter(u => owned.has(u.id)).length, total: defs.length };
  };
  return {
    kits: PRODUCERS.map((producer, i) => {
      const defs = UPGRADES.filter(u => u.effect.kind === 'producer' && u.effect.target === producer.id);
      return { id: producer.id, label: LABELS[i], slots: defs.map(u => ({ id: u.id, bought: owned.has(u.id) })) };
    }),
    global: count('global'), synergy: count('synergy'),
    bought: UPGRADES.filter(u => owned.has(u.id)).length,
  };
}

/** Camera 05: an equipment wall and three physical endless-upgrade stations. */
export class WorkshopCam extends Camera<WorkshopView> {
  private fresh = 0;
  private changed: string[] = [];
  private lastPurchase = '';
  private anomaly: WorkshopAnomaly | null = null;
  private anomalyLeft = 0;
  private anomalyIn = 12;
  private previousAnomaly: WorkshopAnomaly | null = null;
  private inventory = workshopInventory([]);
  private inventoryKey = '';

  constructor() {
    super('КАМ-05 · МАСТЕРСКАЯ', 'Мастерская: оборудование купленных улучшений');
    this.root.classList.add('workshop');
  }

  bought(ids: string[]): void {
    this.changed = ids;
    this.fresh = 2;
    const last = ids[ids.length - 1];
    this.lastPurchase = upgradeById(last)?.name ?? trackById(last)?.name ?? '';
    if (ids.length > 1) this.lastPurchase = `Установлено улучшений: ${ids.length}`;
  }

  protected simulate(dt: number): void {
    this.fresh = Math.max(0, this.fresh - dt);
    const options = workshopAnomalies(this.view!);
    if (!options.length || (this.anomaly && !options.includes(this.anomaly))) {
      this.anomaly = null;
      this.anomalyLeft = 0;
      this.anomalyIn = 12;
    }
    if (!options.length) return;
    this.anomalyLeft = Math.max(0, this.anomalyLeft - dt);
    if (this.anomalyLeft > 0) return;
    this.anomaly = null;
    this.anomalyIn -= dt;
    if (this.anomalyIn > 0) return;
    const fresh = options.filter(option => option !== this.previousAnomaly);
    const pool = fresh.length ? fresh : options;
    this.anomaly = pool[Math.floor(Math.random() * pool.length)];
    this.previousAnomaly = this.anomaly;
    this.anomalyLeft = 7;
    this.anomalyIn = 25 + Math.random() * 20 - this.view!.threat * 10;
  }

  private get motion(): number { return this.reducedMotion ? 0 : this.t; }

  /** A slow rise and fall, never a flash or a sudden camera jolt. */
  private haunting(kind: WorkshopAnomaly): number {
    if (this.reducedMotion || this.anomaly !== kind || this.anomalyLeft <= 0) return 0;
    return Math.sin((1 - this.anomalyLeft / 7) * Math.PI);
  }

  private highlighted(ids: string[]): boolean {
    return !this.reducedMotion && this.fresh > 0 && ids.some(id => this.changed.includes(id));
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const key = v.upgrades.join('|');
    if (key !== this.inventoryKey) {
      this.inventoryKey = key;
      this.inventory = workshopInventory(v.upgrades);
    }
    const inv = this.inventory;
    const aria = `Мастерская: улучшений ${inv.bought}/${UPGRADES.length}. ${inv.kits.map(k => `${k.label}: ${k.slots.filter(s => s.bought).length}/${k.slots.length}`).join('; ')}. Общие: ${inv.global.bought}/${inv.global.total}; связи: ${inv.synergy.bought}/${inv.synergy.total}. Уплотнение ${v.compact}; опт ${v.bulk}; договор ${v.dark}.`;
    if (this.canvas.getAttribute('aria-label') !== aria) this.canvas.setAttribute('aria-label', aria);
    ctx.save();
    ctx.scale(w / 360, h / 270);
    const bg = ctx.createLinearGradient(0, 0, 0, 270);
    bg.addColorStop(0, '#07170e'); bg.addColorStop(1, '#030a06');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 360, 270);
    // The surveillance camera looks down across a working room, not an inventory board.
    this.poly([[0, 28], [22, 48], [22, 181], [0, 221]], '#183d27');
    this.poly([[337, 48], [360, 28], [360, 221], [337, 181]], '#183d27');
    ctx.fillStyle = '#0b1e13'; ctx.fillRect(22, 48, 315, 133);
    for (let row = 0; row < 6; row++) {
      const y = 53 + row * 23;
      this.line(23, y, 336, y, '#102b1b', 0.7);
      for (let x = 25 + (row % 2) * 26; x < 337; x += 53) this.line(x, y, x, y + 22, '#102b1b', 0.7);
    }
    for (let i = 0; i < 6; i++) this.line(180 + (i-3)*36,181,180+(i-3)*90,250,'#153722');
    this.line(0,220,360,220,'#193e28');
    this.line(24,181,337,181,'#2c5035',2);
    // Ceiling pipe, drooping electrical cable and a local pool of work light.
    this.line(20,49,246,49,'#31563a',3);this.line(246,49,246,164,'#31563a',3);
    this.line(61,49,61,65,C.deep);this.line(151,49,151,65,C.deep);
    this.box(52,65,109,6,'#55735b');this.line(58,73,155,73,'#c5b98b',2);
    const light=ctx.createRadialGradient(109,91,5,109,125,126);
    light.addColorStop(0,'rgba(212,180,111,0.24)');light.addColorStop(0.6,'rgba(142,141,79,0.09)');light.addColorStop(1,'rgba(142,141,79,0)');
    ctx.fillStyle=light;ctx.fillRect(23,73,224,150);
    // Dust drifts through the lamp cone; no new particles or allocations per frame.
    for (let i = 0; i < 12; i++) {
      const x = 48 + (i * 37) % 124 + Math.sin(this.motion * 0.3 + i) * 4;
      const y = 78 + ((i * 19 + this.motion * (1 + i % 3)) % 103);
      ctx.fillStyle = 'rgba(163,193,153,0.22)'; ctx.fillRect(x, y, 1, 1);
    }
    // A strip of discarded packaging caught on the conduit.
    const strip = Math.sin(this.motion * 0.8) * 2;
    this.poly([[244,144],[249,148],[246+strip,162],[241+strip,156]], '#37523b', 0.7);
    const cold=ctx.createRadialGradient(303,151,8,303,156,100);
    cold.addColorStop(0,'rgba(91,163,142,0.11)');cold.addColorStop(1,'rgba(43,96,76,0)');
    ctx.fillStyle=cold;ctx.fillRect(249,58,102,184);
    ctx.strokeStyle='#41654a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(168,52);ctx.bezierCurveTo(190,143,229,77,226,166);ctx.stroke();
    // Tool rail: individual purchased tiers hang as full-size tools, not miniatures.
    this.box(34,83,141,66,'#152f20',0.7);
    for(let y=89;y<146;y+=9)for(let x=41;x<173;x+=10){ctx.fillStyle='#28452f';ctx.fillRect(x,y,1,1);}
    const purchased=inv.kits.flatMap(k=>k.slots).filter(slot=>slot.bought);
    for(let i=0;i<Math.min(purchased.length,12);i++){
      const x=45+(i%6)*23,y=92+Math.floor(i/6)*28;
      const glow=this.highlighted([purchased[i].id]);
      const color=glow?C.light:'#8bb195';
      this.circle(x,y,1.5,C.deep);
      ctx.save(); ctx.translate(x,y);
      const paused = this.haunting('press') > 0;
      const sway = this.reducedMotion ? 0 : paused
        ? (i === 0 ? Math.sin(this.motion * 1.7) * 0.16 : 0)
        : Math.sin(this.motion * 2.2 + i * 0.7) * (v.compact > 0 ? 0.018 : 0.004);
      if (i === 4) ctx.rotate(-0.12);
      ctx.rotate(sway); ctx.translate(-x,-y);
      if(i%3===0){
        this.line(x,y+5,x-3,y+21,color,2.5);
        this.line(x-4,y+2,x-3,y+8,color,2);this.line(x+4,y+2,x+2,y+8,color,2);this.line(x-3,y+8,x+2,y+8,color,2);
      }else if(i%3===1){this.line(x,y+5,x,y+22,color,2);this.box(x-7,y+3,14,5,color);}
      else{this.line(x-4,y+21,x+3,y+5,color,1.8);this.line(x+4,y+21,x-3,y+5,color,1.8);}
      ctx.restore();
    }
    this.floorShadow(125,241,99,9);
    this.floorShadow(301,232,47,9);
    this.drawStock(v);
    // A solid workbench with a worn top, drawers, a vice and stored parts underneath.
    this.poly([[25,197],[179,197],[205,213],[34,213]],'#5d7756');
    this.metal(34,213,171,7,4,true,true);
    for(let i=0;i<9;i++)this.line(44+i*17,201+(i%3)*2,52+i*17,203+(i%3)*2,'#72826a',0.6);
    this.box(39,220,61,24,'#264932');this.box(104,220,60,24,'#264932');
    for(const x of [43,108])for(const y of [222,233]){this.box(x,y,52,8,'#1e3928');this.line(x+20,y+4,x+32,y+4,'#63856a');}
    this.line(197,220,200,246,C.deep,5);
    this.box(35,190,20,11,'#729278');this.box(30,188,10,5,C.green);this.box(52,188,8,5,C.green);
    this.line(45,199,45,222,C.deep,3);this.line(37,217,54,217,'#a0b59d');
    // Discarded offcuts and a flattened can collect around the bench feet.
    this.poly([[17,237],[27,232],[35,236],[24,240]],'#435c42',0.6);
    this.poly([[166,240],[174,235],[182,238],[179,244]],'#38513d',0.6);
    this.line(13,231,24,225,'#52644b');this.line(24,225,27,230,'#52644b');
    this.circle(176,239,3,'#59725d',0.8);this.line(173,239,180,241,'#91a18b',0.7);
    this.workshopParts(v);
    this.drawCompactor(v);
    this.drawContract(v);

    const latestExists = this.changed.some(id => v.upgrades.includes(id) || ((id === 'compact' || id === 'bulk' || id === 'dark') && v[id] > 0));
    const incident = !this.reducedMotion && this.anomaly && this.anomalyLeft > 0 ? ANOMALY_TEXT[this.anomaly] : '';
    const caption = incident || (latestExists && this.lastPurchase ? this.lastPurchase : 'Покупки оснащают мастерскую');
    ctx.fillStyle = '#061009'; ctx.fillRect(0, 250, 360, 20);
    this.line(0, 250, 360, 250, '#285337');
    if (incident || (latestExists && this.fresh > 0)) this.label(caption.length > 45 ? caption.slice(0, 42) + '…' : caption, 12, 263, '#a0cbaa', 'left');
    ctx.restore();
    this.vignette(v.threat * 0.5);
  }

  private floorShadow(x: number, y: number, rx: number, ry: number): void {
    this.ctx.fillStyle='rgba(0,5,3,0.65)';
    this.ctx.beginPath();this.ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);this.ctx.fill();
  }

  /** Solid lit faces: the equipment has thickness even in the small camera feed. */
  private metal(x: number,y: number,w: number,h: number,d: number,on: boolean,warm=false): void {
    const ctx=this.ctx;
    const face=(points: [number,number][],color:string)=>{
      ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));
      ctx.closePath();ctx.fillStyle=color;ctx.fill();
    };
    face([[x,y],[x+d,y-d],[x+w+d,y-d],[x+w,y]],on?(warm?'#6d7554':'#527e6d'):'#253d30');
    face([[x+w,y],[x+w+d,y-d],[x+w+d,y+h-d],[x+w,y+h]],'#10271e');
    const gradient=ctx.createLinearGradient(x,y,x+w,y+h);
    gradient.addColorStop(0,on?(warm?'#4d5e40':'#345c4b'):'#1b3025');gradient.addColorStop(1,'#152b21');
    ctx.fillStyle=gradient;ctx.fillRect(x,y,w,h);
    this.line(x,y,x+w,y,on?'#7a9e86':'#3b5847',0.8);
    this.line(x,y,x,y+h,on?'#688f77':'#304b3b',0.8);
  }

  /** Producer families add useful physical fittings to the same room. */
  private workshopParts(v: WorkshopView): void {
    const levels=this.inventory.kits.map(k=>k.slots.filter(s=>s.bought).length);
    // A bag and gloves hang beside the board; wheels and spares sit below it.
    if(levels[0]){
      this.line(26,106,26,141,C.deep,2);
      this.poly([[19,143],[22,135],[31,135],[38,157],[17,157]],'#52775a');
      if(levels[0]>1){this.box(28,116,5,12,'#769b7d');this.box(35,119,5,12,'#769b7d');}
    }
    for(let i=0;i<levels[1];i++){
      const x=183+i*5;
      this.circle(x,234,10,'#47634c',3);this.circle(x,234,4,'#243f2c');
    }
    if(levels[2]){
      this.box(69,182,25,17,'#45654b');this.box(72,179,4,3,C.green);this.box(87,179,4,3,C.green);
      this.line(76,182,79,178,C.light);this.line(79,178,82,182,C.light);
      for(let i=1;i<levels[2];i++)this.line(72+i*5,187,72+i*5,197,C.deep);
    }
    if(levels[3]){
      this.box(110,177,25,22,'#446b4e');this.box(114,181,17,10,'#a2c197');
      for(let i=0;i<levels[3];i++)this.circle(115+i*5,195,1,C.light);
    }
    // Bench drill with a real column and chuck replaces the generic factory symbol.
    if(levels[5]){
      this.box(159,199,27,4,C.deep);this.line(179,199,179,158,'#75917a',4);
      this.box(155,156,29,10,'#5b8064');this.line(161,166,161,183,'#a3b9a3',3);
      this.box(153,184,23,3,C.deep);this.line(184,162,193,172,C.green,2);
      if(levels[5]>2)this.circle(193,172,3,C.green);
    }
    // Tall shelf for filters, sheet stock and the stranger late-game equipment.
    this.line(190,78,190,145,C.deep,3);this.line(236,78,236,145,C.deep,3);
    for(const y of [103,140])this.box(187,y,53,4,'#46674b');
    for(let i=0;i<levels[6];i++)this.box(194+i*2,134-i*3,33,2,'#688371');
    if(levels[7]){
      this.box(193,83,18,19,'#53775d');
      for(let i=0;i<levels[7]+2;i++)this.line(195,86+i*2,209,86+i*2,C.deep);
    }
    if(levels[8]){
      this.line(219,102,219,88,C.deep,2);this.circle(219,86,8,'#73917b');
      this.line(219,86,230,76,C.light);if(levels[8]>2)this.circle(230,76,2,C.light);
    }
    if(levels[9]){this.box(219,116,12,19,'#53775d');this.circle(225,125,4,'#09170f',0);}
    // Global upgrades power the electrical cabinet; synergies add connected terminals.
    this.box(210,151,31,39,'#2d4d36');
    for(let i=0;i<this.inventory.global.total;i++){
      this.ctx.fillStyle=i<this.inventory.global.bought?C.green:'#142c1d';
      this.ctx.fillRect(215+(i%3)*7,157+Math.floor(i/3)*7,4,4);
    }
    for(let i=0;i<this.inventory.synergy.bought;i++)this.line(216+i*4,184,215+i*5,197,'#65846b',1);
    if(v.threat>0.6)this.line(246,164,249,168,C.deep);
  }

  private drawCompactor(v: WorkshopView): void {
    const x=300, floor=224, top=76;
    const on=v.compact>0, glow=this.highlighted(['compact']);
    const c=on?C.green:C.far;
    const resistance=this.haunting('press');
    const breath=resistance*(5+Math.sin(this.motion*3)*2);
    const block=Math.max(7,28-Math.log2(v.compact+1)*3)+breath;
    const pump=this.reducedMotion || !on || resistance > 0 ? 0 : -8*(0.5+0.5*Math.cos(this.motion*0.8))-(glow?Math.sin((2-this.fresh)*Math.PI)**2*6:0);
    this.metal(x-32,top+10,7,floor-top-10,4,on);
    this.metal(x+25,top+10,7,floor-top-10,4,on);
    this.metal(x-37,floor,74,8,5,on);
    // Scuffed guide rails and the manufacturer's riveted plate.
    for(const side of [-29,28])for(let i=0;i<5;i++){
      const y=top+18+i*26;
      this.line(x+side,y,x+side+2,y+8,on?'#749784':'#304b3b',0.6);
      this.circle(x+side,top+14+i*27,0.8,c,0);
    }
    // The cap overlaps the upright ends and their raised top faces.
    this.metal(x-35,top,70,10,6,on);
    this.box(x-14,top+2,28,6,'#1d3024',0.7);
    this.line(x-10,top+5,x+9,top+5,'#78947b',0.7);
    const plate=floor-block-7+pump;
    const piston=this.ctx.createLinearGradient(x-3,0,x+4,0);
    piston.addColorStop(0,'#1d392d');piston.addColorStop(0.4,on?'#9cb7a3':'#4a6353');piston.addColorStop(1,'#264638');
    this.ctx.fillStyle=piston;this.ctx.fillRect(x-3,top+10,7,plate-top-10);
    if(on){
      const twitch=resistance*Math.sin(this.motion*5)*1.3;
      this.floorShadow(x,floor+1,29,4);
      this.box(x-23+twitch,floor-block,46,block,C.deep);
      for(let i=0;i<9;i++){
        const px=x-20+(i*13)%40,py=floor-block+3+(i*7)%Math.max(3,block-5);
        this.poly([[px,py],[px+5,py-2],[px+8,py+1],[px+2,py+3]],i%2?'#456750':'#6d7c59',0.5);
      }
      for(let i=0;i<5;i++)this.line(x-19+i*8,floor-block+3,x-16+i*8,floor-2,C.green,0.7);
      // Binding wire and a folded plastic sheet push out of the compressed rubbish.
      if (resistance > 0.05) {
        const reach=resistance*17;
        this.poly([[x+20,floor-5],[x+25+reach,floor-9-reach/2],[x+30,floor-3],[x+21,floor-2]], '#709273');
        this.line(x-21,floor-4,x-27-reach/2,floor-11-resistance*8,C.green,1.2);
        this.line(x-27-reach/2,floor-11-resistance*8,x-23,floor-17-resistance*5,C.green,1.2);
      }
      this.metal(x-27,plate,54,9,5,on);
      if(glow)this.line(x-25,plate,x+24,plate,C.light,1.2);
    }else this.box(x-27,plate,54,6,C.far);

  }

  private drawStock(v: WorkshopView): void {
    // Low storage on the rear floor, clear of the electrical cabinet and bench.
    this.ctx.save();
    this.ctx.translate(241,220);this.ctx.scale(0.58,0.58);this.ctx.translate(-237,-237);
    const x=237, floor=237;
    this.floorShadow(x,floor+3,33,5);
    const glow=this.highlighted(['bulk']);
    const stir=this.haunting('stock');
    this.box(x-33,floor,66,4,C.deep);

    for(let k=0;k<Math.min(v.bulk,6);k++){
      const cx=x-30+(k%3)*21, cy=floor-18-Math.floor(k/3)*18;
      this.metal(cx,cy,19,16,3,true);
      if(glow)this.line(cx,cy,cx+19,cy,C.light);
      this.line(cx+2,cy+2,cx+17,cy+14,C.deep);
      this.line(cx+9,cy,cx+9,cy+16,C.deep,0.7);
      if(k===Math.min(v.bulk,6)-1 && stir>0.02){
        this.poly([[cx,cy],[cx+19,cy],[cx+17,cy-stir*9],[cx+2,cy-stir*13]],'#55795e');
        this.poly([[cx+4,cy],[cx+6,cy-stir*17],[cx+12,cy-stir*20],[cx+16,cy],[cx+10,cy-3]],'#233d2b');
        this.line(cx+9,cy-stir*5,cx+7+Math.sin(this.motion*3)*stir*3,cy-stir*17,C.green,0.8);
      }
    }
    this.ctx.restore();
  }

  private drawContract(v: WorkshopView): void {
    const x=135, on=v.dark>0;
    const ink=this.haunting('contract');

    // More signed pages, a heavier binding and a seal as the pact grows.
    if(on){
      for(let i=Math.min(v.dark,5)-1;i>=0;i--)this.box(x-20+i,186-i*2,40,31,C.deep);
      this.actor(()=>this.box(x-21,183,42,31,this.highlighted(['dark'])?C.light:'#8cb995'));
      for(let i=0;i<Math.min(v.dark,6);i++)this.line(x-15,188+i*3,x+9-(i%2)*7,188+i*3,C.deep,0.7);
      this.circle(x+12,207,4,'#cb9c76');
      if(v.dark>=5)this.line(x+4,183,x+4,214,C.deep,2);
      if(ink>0.05){
        // The signature grows across the waste-paper contract, then sinks into the paper.
        for(let i=0;i<Math.ceil(ink*8);i++)this.line(x-15+i*3,208,x-13+i*3,205+(i%3),'#6c4734',1);
        this.poly([[x+13,183],[x+21,183],[x+21-ink*5,190+ink*3]],'#b1c0a5',0.5);
      }
    }
    this.line(x+27,190,x+23,212,C.green,2);

  }
}
