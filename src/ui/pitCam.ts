import type { BottomState } from '../game/bottom';
import { Camera } from './camera';

/** What camera 09 needs to know about the bottom. */
export interface PitView {
  /** Tonnes lying on the heap. */
  heap: number;
  /** Tonnes a minute falling in from above. */
  fall: number;
  /** Tonnes a minute Ignatyev digs, if there is anything to dig. */
  dig: number;
  /** Containers dug out and waiting, by kind, sack first. */
  stock: number[];
  equipment: BottomState['equipment'];
  auto: number;
  depth: number;
  work: 'depth' | 'site' | 'seam';
  benchMode: BottomState['benchMode'];
  object: { id: 'hoist' | 'bench' | 'borer'; progress: number } | null;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A fixed cross-section of the working cavern: intake, platform, shaft and excavation face. */
export class PitCam extends Camera<PitView> {
  private swing = 0;
  private lookUp = 0;
  private lookIn = 30;
  private flashColor = '';
  private flashLeft = 0;

  constructor() {
    super('КАМ-09 · ДНО', 'Камера на дне ямы');
    this.root.classList.add('pit');
    this.lurks = false;
  }

  /** A rare find: the frame lights in its colour for a moment. */
  find(color: string): void {
    if (this.reducedMotion) return;
    this.flashColor = color;
    this.flashLeft = 0.9;
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    if (v.dig > 0 && this.lookUp <= 0) this.swing += dt * (2.4 + Math.min(4, v.dig * 0.15));
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookUp = rnd(2, 3.5);
      this.lookIn = rnd(40, 90);
    }
    this.lookUp = Math.max(0, this.lookUp - dt);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    ctx.save();
    ctx.scale(w / 360, h / 230);
    const fill = (x: number, y: number, a: number, b: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, a, b); };
    const line = (x: number, y: number, a: number, b: number, c: string, width = 1) => {
      ctx.strokeStyle = c; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a, b); ctx.stroke();
    };
    const poly = (points: number[][], c: string) => {
      ctx.fillStyle = c; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
    };
    fill(0, 0, 360, 230, '#030a07');
    // Continuous sedimentary walls, with a deterministic texture rather than swimming noise.
    poly([[0,0],[360,0],[360,213],[330,207],[319,176],[335,147],[322,113],[339,80],[322,42],[44,36],[28,68],[38,109],[20,145],[28,209],[0,220]], '#12251c');
    let seed = 71;
    const rand = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const x = rand() * 360, y = 30 + rand() * 180;
      const face = x < 35 || x > 325;
      line(x, y, x + 5 + rand() * 18, y + 2, face ? '#294535' : '#10271c');
    }
    for (let i = 0; i < 5; i++) {
      const y = 46 + i * 32;
      line(32, y, 326, y + 4, '#193326');
      line(33, y + 3, 326, y + 7, '#0b1d14');
    }
    // Timber supports define an actual cavern and carry the lamps and cables.
    for (const x of [28, 322]) {
      fill(x, 36, 7, 158, '#294233'); fill(x + 1, 36, 2, 158, '#45634a');
      line(x, 69, x + (x < 100 ? 25 : -23), 40, '#42634a', 4);
    }
    fill(24, 32, 310, 8, '#334e3c'); fill(24, 32, 310, 2, '#65806a');
    line(36, 46, 310, 52, '#4c6250');
    const light = ctx.createRadialGradient(173, 61, 0, 173, 100, 140);
    light.addColorStop(0, 'rgba(143,181,125,.18)'); light.addColorStop(1, 'rgba(40,80,50,0)');
    ctx.fillStyle = light; ctx.fillRect(32, 40, 290, 160);
    fill(164, 49, 19, 5, '#5c7257'); fill(169, 54, 9, 3, '#c3c49a');
    // Surface waste arrives in a chute, lands in a hopper, then feeds a short sorting belt.
    fill(54, 0, 34, 98, '#101d17'); fill(54, 0, 3, 98, '#43614b'); fill(85, 0, 3, 98, '#334b3a');
    for (let y = 30; y < 92; y += 19) fill(54, y, 34, 3, '#263d2e');
    if (v.fall > 0) for (let i = 0; i < 7; i++) {
      const phase = this.reducedMotion ? i / 7 : (i / 7 + this.t * 0.31) % 1;
      fill(61 + (i % 3) * 7, 23 + phase * 76, 3 + i % 3, 3, i % 2 ? '#8e9875' : '#4f7352');
    }
    const heapHeight = Math.min(25, Math.log10(1 + v.heap) * 6);
    poly([[44,110],[95,110],[88,135],[53,135]], '#36503b');
    poly([[48,109],[57,110-heapHeight],[68,115-heapHeight],[78,108-heapHeight],[93,110]], '#4b6045');
    for (let i = 0; i < 12; i++) fill(51 + i * 3, 107 - (i % 3) * 3, 3, 2, '#79816a');
    fill(57,135,24,9,'#182c20');
    fill(40,151,94,7,'#4a6650'); fill(40,158,94,4,'#1d3525');
    for (let x = 45; x < 133; x += 17) { fill(x,163,3,24,'#36543d'); fill(x-2,155,7,3,'#71816a'); }
    if (v.heap > 0 || v.fall > 0) for (let i = 0; i < 5; i++) {
      const phase = this.reducedMotion ? i / 5 : (i / 5 + this.t * 0.12) % 1;
      fill(47 + phase * 76,147,5,3,'#8d9476');
    }
    if (v.equipment.bench || v.auto > 0) {
      fill(99,123,26,28,'#34513c'); fill(102,126,20,13,'#152d20');
      line(108,129,117,136,'#8ca184',2); fill(105,142,14,4,'#6b825f');
      fill(125,162,14,15,'#3c5e45'); fill(128,158,8,4,v.benchMode === 'nonferrous' ? '#82a99b' : '#8b9170');
    } else { fill(124,163,14,14,'#3b5039'); fill(124,163,14,2,'#6b7e5c'); }
    // A real opening through the floor, bordered by a platform and a ladder into darkness.
    fill(32,190,118,9,'#2b4232'); fill(32,190,118,2,'#638067');
    fill(211,190,115,9,'#2b4232'); fill(211,190,115,2,'#638067');
    poly([[149,191],[211,191],[202,222],[158,222]],'#010603');
    line(149,192,158,222,'#43614a'); line(211,192,202,222,'#243e2b');
    line(157,190,162,224,'#698266'); line(167,190,170,224,'#4a654c');
    for (let y=194;y<224;y+=6) line(158+(y-194)*.15,y,168+(y-194)*.08,y,'#5d7759');
    // Purchased hoist straddles the opening; its moving bucket shares the same shaft.
    if (v.equipment.hoist) {
      fill(143,91,5,100,'#3e5c45'); fill(211,91,5,100,'#3e5c45');
      fill(140,87,79,7,'#617c5c'); line(146,94,163,109,'#405f46',3);
      fill(172,92,12,9,'#809274');
      const phase = this.reducedMotion ? .5 : (1+Math.sin(this.t*.65))/2;
      const by=119+phase*72;
      line(178,100,178,by,'#8e9d80');
      poly([[168,by],[188,by],[185,by+12],[171,by+12]],'#4f6e50');
      fill(168,by,20,2,'#9aa589');
    }
    // Active excavation occupies the right rock face, not a floating card.
    const p = v.object?.progress ?? 0;
    const site = v.object && p < 1;
    poly([[264,103],[282,95],[303,104],[322,97],[332,125],[320,148],[331,168],[316,190],[263,190],[254,162]], '#203b2a');
    for(let i=0;i<12;i++) line(264+(i%3)*18,113+Math.floor(i/3)*18,276+(i%3)*18,116+Math.floor(i/3)*18,'#3d5a3f');
    if (v.object) {
      ctx.save(); ctx.beginPath(); ctx.rect(258,98,71,94); ctx.clip();
      const color = p >= 1 ? '#87946b' : '#6c8061';
      if(v.object.id==='hoist') {
        fill(270,109,4,75,color); fill(309,109,4,75,color); fill(268,107,48,6,color);
        fill(284,122,14,9,'#4a6550'); line(291,130,291,162,color); fill(281,162,21,13,color);
      } else if(v.object.id==='bench') {
        fill(268,139,49,6,color); fill(272,145,4,40,color); fill(309,145,4,40,color); fill(280,120,23,19,color);
      } else {
        fill(276,143,43,22,color); poly([[276,146],[262,155],[276,163]],'#92a17a');
        for(let x=283;x<318;x+=12) { fill(x,165,9,6,'#425f43'); fill(x+2,167,5,2,color); }
      }
      if(site) {
        const edge=111+p*75;
        poly([[253,edge+3],[267,edge-3],[279,edge+5],[292,edge-1],[307,edge+4],[331,edge-2],[335,194],[252,194]],'#233d29');
        for(let i=0;i<10;i++) fill(259+i*7,edge+8+(i%3)*8,4,2,'#435b3c');
      }
      ctx.restore();
    }
    if(v.equipment.borer>0) {
      fill(230,171,35,16,'#46664b'); fill(236,167,19,5,'#678164');
      for(let x=234;x<263;x+=11) fill(x,187,8,4,'#71826a');
      const drill = this.reducedMotion ? 0 : Math.sin(this.t*12)*2;
      poly([[264,174],[279+drill,181],[264,187]],'#a2a57c');
      for(let i=0;i<6;i++) {
        const x=303+(i%2)*10,y=124+i*9;
        poly([[x,y-4],[x+3,y],[x,y+4],[x-3,y]],v.work==='seam'?'#b4a36b':'#5e7151');
      }
    }
    // Only a few containers wait on the platform; they never cover the working face.
    const count = Math.min(3, v.stock.reduce((a,b)=>a+b,0));
    for(let i=0;i<count;i++) { fill(216+i*12,180-(i%2)*3,10,9,'#34533c'); fill(217+i*12,181-(i%2)*3,8,1,'#70846b'); }
    const activeX=v.work==='site'?247:v.work==='seam'?284:208;
    if(!this.reducedMotion) for(let i=0;i<4;i++) {
      const phase=(this.t*1.3+i/4)%1;
      fill(activeX+phase*9,181+phase*8,2,1,'#94a181');
    }
    // A single quiet CCTV caption leaves the scene itself to explain the machinery.
    fill(0,216,360,14,'#051009');
    ctx.font='8px monospace'; ctx.fillStyle='#92ad8e'; ctx.textAlign='left';
    ctx.fillText(v.work==='site'?'РАСКОПКА ОБЪЕКТА':v.work==='seam'?'ЖИЛА · ДОБЫЧА АНОМАЛИЙ':'ЗАБОЙ · ПРОХОД ВНИЗ',12,226);
    ctx.textAlign='right'; ctx.fillStyle='#657f66';
    ctx.fillText(v.work==='site'&&v.equipment.hoist?'ВНИЗ 25%':v.work==='depth'?'ГЛУБИНА РАСТЁТ':'ГЛУБИНА СТОИТ',347,226);
    ctx.restore();
    const mx = v.work === 'site' ? 243 : v.work === 'seam' ? 224 : 217;
    ctx.save();
    if (v.work === 'depth') { ctx.translate(2 * w * mx / 360, 0); ctx.scale(-1, 1); }
    this.miner(w * mx / 360, h * 190 / 230);
    ctx.restore();
    if (this.flashLeft > 0) {
      ctx.fillStyle = this.flashColor; ctx.globalAlpha = .12*this.flashLeft;
      ctx.fillRect(0,0,w,h); ctx.globalAlpha = 1;
    }
    this.vignette(.32);
  }

  /** Ignatyev: a padded jacket, a cap with a lamp, the pick going up and down. */
  private miner(x: number, ground: number): void {
    const { ctx } = this;
    const looking = this.lookUp > 0;
    const a = looking ? -0.2 : Math.sin(this.swing) * 0.9 - 0.3;
    const head: [number, number] = [x, ground - 30];
    // The lamp's beam: down at the heap, or up into the camera when he looks.
    const beam = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 70);
    beam.addColorStop(0, 'rgb(220 255 210 / 0.35)');
    beam.addColorStop(1, 'rgb(220 255 210 / 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(head[0], head[1]);
    const dir = looking ? -Math.PI / 2 : Math.PI * 0.2;
    ctx.arc(head[0], head[1], 70, dir - 0.35, dir + 0.35);
    ctx.closePath();
    ctx.fill();
    this.actor(() => {
      // Legs, body, the head with its cap.
      this.poly([[x - 6, ground], [x - 3, ground - 14], [x + 3, ground - 14], [x + 6, ground]], '#0e2015', 1);
      this.poly([[x - 7, ground - 13], [x - 6, ground - 26], [x + 6, ground - 26], [x + 7, ground - 13]], '#16402a', 1.2);
      this.circle(head[0], head[1], 4.5, '#0e2015', 1.2);
      this.box(head[0] - 5, head[1] - 6, 10, 2.5, '#16402a', 1);
      // The arm and the pick.
      const hx = x + 4 + Math.cos(a) * 10;
      const hy = ground - 22 + Math.sin(a) * 10;
      ctx.beginPath();
      ctx.moveTo(x + 4, ground - 22);
      ctx.lineTo(hx, hy);
      this.paint('#16402a', 2);
      ctx.beginPath();
      ctx.moveTo(hx - Math.sin(a) * 6, hy + Math.cos(a) * 6);
      ctx.lineTo(hx + Math.sin(a) * 6, hy - Math.cos(a) * 6);
      this.paint('#6a9f74', 1.5);
    });
    // The lamp itself.
    ctx.fillStyle = '#e8ffe8';
    ctx.fillRect(head[0] - 1, head[1] - 5, 2.5, 2.5);
  }
}
