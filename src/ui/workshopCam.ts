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
  private twitch = 0;
  private twitchIn = 15;
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
    this.twitchIn -= dt;
    if (this.view!.threat >= 0.6 && this.view!.compact > 0 && this.twitchIn <= 0) {
      this.twitch = 1.5;
      this.twitchIn = 18 + Math.random() * 18;
    }
    this.twitch = Math.max(0, this.twitch - dt);
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
    // Perspective wall, raised equipment rails, and a concrete floor.
    this.poly([[0, 28], [14, 42], [14, 146], [0, 171]], '#21432c');
    this.poly([[346, 42], [360, 28], [360, 171], [346, 146]], '#21432c');
    this.box(14, 42, 332, 104, C.far);
    this.line(0, 171, 360, 171, C.deep);
    for (let i = 0; i < 7; i++) this.line(180 + (i - 3) * 38, 147, 180 + (i - 3) * 90, 270, '#123724');
    this.line(0, 240, 360, 240, '#21432c');
    this.label(`ОСНАЩЕНО ${inv.bought}/${UPGRADES.length}`, 18, 37, C.light, 'left');
    // Each purchased global upgrade powers a lamp; synergies connect the bus below it.
    this.status('ОБЩИЕ', inv.global, 154, 37);
    this.status('СВЯЗИ', inv.synergy, 250, 37);
    for (let i = 0; i < inv.kits.length; i++) {
      const kit = inv.kits[i];
      const x = 22 + (i % 5) * 65;
      const y = 49 + Math.floor(i / 5) * 47;
      const amount = kit.slots.filter(s => s.bought).length;
      const glow = this.highlighted(kit.slots.map(s => s.id));
      this.box(x, y, 56, 37, glow ? C.light : amount ? C.deep : C.far, glow ? 1.5 : 0.7);
      if (amount) {
        this.actor(() => this.equipment(i, x + 28, y + 14, amount));
      } else {
        this.line(x + 23, y + 13, x + 33, y + 13, '#285b38');
        this.label('—', x + 28, y + 24, C.deep);
      }
      // Fixed slots preserve which exact tiers survived a reset or were bought out of order.
      kit.slots.forEach((slot, index) => {
        ctx.fillStyle = slot.bought ? (glow ? C.light : C.glow) : '#163923';
        ctx.fillRect(x + 7 + index * 11, y + 27, 8, 3);
      });
      this.label(`${kit.label} ${amount}/${kit.slots.length}`, x + 28, y + 44, amount ? '#a0cbaa' : '#52795c');
    }
    this.drawCompactor(v);
    this.drawStock(v);
    this.drawContract(v);
    const latestExists = this.changed.some(id => v.upgrades.includes(id) || ((id === 'compact' || id === 'bulk' || id === 'dark') && v[id] > 0));
    const caption = latestExists && this.lastPurchase ? this.lastPurchase : 'Покупки оснащают мастерскую';
    ctx.fillStyle = '#061009'; ctx.fillRect(0, 250, 360, 20);
    this.line(0, 250, 360, 250, '#285337');
    this.label(caption.length > 45 ? caption.slice(0, 42) + '…' : caption, 12, 263, '#a0cbaa', 'left');
    ctx.restore();
    this.vignette(v.threat * 0.5);
  }

  private status(label: string, value: { bought: number; total: number }, x: number, y: number): void {
    const kind = label === 'ОБЩИЕ' ? 'global' : 'synergy';
    const glow = this.highlighted(UPGRADES.filter(u => u.effect.kind === kind).map(u => u.id));
    if (glow) this.box(x - 3, y - 9, 82, 16, C.light, 1);
    this.label(`${label} ${value.bought}/${value.total}`, x, y, value.bought ? C.light : '#52795c', 'left');
    for (let i = 0; i < value.total; i++) {
      this.ctx.fillStyle = i < value.bought ? C.glow : '#163923';
      this.ctx.fillRect(x + i * 9, y + 3, 6, 2);
    }
  }

  /** Recognisable hardware silhouettes for the ten producer families. */
  private equipment(kind: number, x: number, y: number, amount: number): void {
    const color = C.green;
    if (kind === 0) { // Bag, grabber, spare supplies.
      this.poly([[x-9,y+7],[x-7,y-5],[x-3,y-8],[x+2,y-5],[x+5,y+7]],color);
      this.line(x-6,y-5,x+1,y-5,C.light);
      if (amount >= 2) this.box(x+8,y-2,5,8,color);
      if (amount >= 3) this.line(x+17,y+7,x+13,y-10,C.light,1.5);
    } else if (kind === 1 || kind === 2) {
      this.box(x-14,y-4,23,10,color);
      this.circle(x-9,y+8,3,color); this.circle(x+7,y+8,3,color);
      this.line(x+9,y-4,x+15,y-8,C.light);
      if (amount >= 2) this.box(x-12,y-9,17,5,color);
      if (amount >= 3) this.box(x+10,y-2,7,7,color);
    } else if (kind === 8 || kind === 9) {
      this.circle(x,y,7,color); this.line(x-18,y,x+18,y,C.deep);
      if (amount >= 2) { this.box(x-19,y-6,8,12,color); this.box(x+11,y-6,8,12,color); }
      if (amount >= 3) this.circle(x,y,11,color,0.6);
    } else {
      this.box(x-13,y-7,26,16,color);
      this.box(x-8,y-3,9,8,C.deep);
      for (let i=0;i<amount;i++) this.line(x+5+i*3,y+5,x+5+i*3,y-3-i,C.light);
      if (amount>=3) this.line(x-9,y-7,x-9,y-11,C.light,2);
    }
    if (amount === 4) this.circle(x+21,y-6,2,C.light);
  }

  private drawCompactor(v: WorkshopView): void {
    const x=65, floor=224, top=160;
    const on=v.compact>0, glow=this.highlighted(['compact']);
    const c=on?C.green:C.far;
    const block=Math.max(7,28-Math.log2(v.compact+1)*3);
    const pump=glow?Math.sin((2-this.fresh)*Math.PI*2)*2:0;
    this.box(x-35,top,70,7,c); this.box(x-32,top+7,5,58,c); this.box(x+27,top+7,5,58,c);
    this.box(x-37,floor,74,6,c);
    const plate=floor-block-7+pump;
    this.line(x,top+7,x,plate,on?C.deep:C.far,5);
    if(on){
      const twitch=this.twitch>0?Math.sin(this.t*35):0;
      this.box(x-23+twitch,floor-block,46,block,C.deep);
      for(let i=0;i<5;i++)this.line(x-19+i*8,floor-block+3,x-16+i*8,floor-2,C.green,0.7);
      this.actor(()=>this.box(x-27,plate,54,6,glow?C.light:C.green));
    }else this.box(x-27,plate,54,6,C.far);
    this.label(`УПЛОТНЕНИЕ · ${v.compact}`,x,244,on?C.light:'#52795c');
  }

  private drawStock(v: WorkshopView): void {
    const x=179, floor=226;
    const glow=this.highlighted(['bulk']);
    this.box(x-33,floor,66,4,C.deep);
    if(v.bulk===0)this.label('НЕТ ПОСТАВОК',x,204,'#52795c');
    for(let k=0;k<Math.min(v.bulk,9);k++){
      const cx=x-30+(k%3)*21, cy=floor-18-Math.floor(k/3)*18;
      this.box(cx,cy,19,16,glow?C.light:C.green);
      this.line(cx+2,cy+2,cx+17,cy+14,C.deep);
      this.line(cx+9,cy,cx+9,cy+16,C.light,0.7);
    }
    this.label(`ОПТ · ${v.bulk}`,x,244,v.bulk?C.light:'#52795c');
  }

  private drawContract(v: WorkshopView): void {
    const x=292, on=v.dark>0;
    this.box(x-36,220,72,5,C.deep);this.line(x-30,225,x-30,235,C.deep,2);this.line(x+30,225,x+30,235,C.deep,2);
    // More signed pages, a heavier binding and a seal as the pact grows.
    if(on){
      for(let i=Math.min(v.dark,5)-1;i>=0;i--)this.box(x-20+i,186-i*2,40,31,C.deep);
      this.actor(()=>this.box(x-21,183,42,31,this.highlighted(['dark'])?C.light:'#8cb995'));
      for(let i=0;i<Math.min(v.dark,6);i++)this.line(x-15,188+i*3,x+9-(i%2)*7,188+i*3,C.deep,0.7);
      this.circle(x+12,207,4,'#cb9c76');
      if(v.dark>=5)this.line(x+4,183,x+4,214,C.deep,2);
    }else this.label('НЕ ПОДПИСАН',x,204,'#52795c');
    this.line(x+27,190,x+23,212,C.green,2);
    this.label(`ДОГОВОР · ${v.dark}`,x,244,on?C.light:'#52795c');
  }
}
