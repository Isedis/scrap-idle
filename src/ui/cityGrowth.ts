import { DISTRICTS, plan, cityPitRoutes, type CityState, type DistrictType, type Point } from '../game/city';

const routeCache = new WeakMap<readonly string[], { count: number; routes: ReturnType<typeof cityPitRoutes> }>();
function routesFor(owned: readonly string[]) {
  const cached = routeCache.get(owned);
  if (cached?.count === owned.length) return cached.routes;
  const routes = cityPitRoutes(owned);
  routeCache.set(owned, { count: owned.length, routes });
  return routes;
}

/** City infrastructure and conveyors share the same permanent development level. */
export function drawCityGrowth(ctx: CanvasRenderingContext2D, w: number, cells: Point[][], city: CityState, level: number, time: number): void {
  if (level < 1) return;
  ctx.save();
  const centers = new Map(DISTRICTS.map((d) => [d.id, [d.x * w, (d.y + .045) * w] as Point]));
  const pit = DISTRICTS.find(d => d.id === 'pit')!;
  centers.set('pit', [pit.x * w, pit.y * w]);
  const routes: [Point, Point, number][] = routesFor(city.owned).map(({from,to,load})=>[centers.get(from)!,centers.get(to)!,load]);
  if (level >= 4) {
    for (const [a, b, load] of routes) drawBelt(ctx, b===centers.get('pit') ? [a,b] : [a,[a[0],b[1]],b], load, level, time);
  }
  for (let i = 0; i < DISTRICTS.length; i++) {
    const d = DISTRICTS[i];
    if (!city.owned.includes(d.id) || d.type === 'pit') continue;
    const cell = cells[i];
    const xs = cell.map((p) => p[0]), ys = cell.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    ctx.save(); ctx.beginPath(); cell.forEach((p, j) => j ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.clip();
    plot(ctx, d.x * w, d.y * w, Math.min(bw, w * .155), Math.min(bh, w * .19), d.type, level, i);
    ctx.restore();
  }
  ctx.restore();
}

/** A terminal conveyor: visible chevrons and pieces all travel from the district toward the pit. */
function drawBelt(ctx: CanvasRenderingContext2D, points: Point[], load: number, level: number, time: number): void {
  const width = Math.min(8, 2.5 + Math.log2(load + 1) * .8 + (level >= 16 ? 1.2 : 0));
  const path = () => { ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p)); };
  ctx.lineJoin='round';path();ctx.strokeStyle='#020805';ctx.lineWidth=width+2;ctx.stroke();
  path();ctx.strokeStyle=load>5?'#536d50':'#304b36';ctx.lineWidth=width;ctx.stroke();
  path();ctx.strokeStyle='#101e14';ctx.lineWidth=Math.max(1,width-1.5);ctx.stroke();
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  const total=lengths.reduce((a,b)=>a+b,0);
  if(total<2)return;
  const at=(distance:number)=>{
    let segment=0;
    while(segment<lengths.length-1&&distance>lengths[segment])distance-=lengths[segment++];
    const a=points[segment],b=points[segment+1],t=distance/Math.max(1,lengths[segment]);
    return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,angle:Math.atan2(b[1]-a[1],b[0]-a[0])};
  };
  // Direction remains readable in a static frame and with reduced motion.
  for(let distance=9;distance<total-3;distance+=20){
    const p=at(distance);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.strokeStyle=load>5?'#a5a173':'#6c8663';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-2,-2);ctx.lineTo(0,0);ctx.lineTo(-2,2);ctx.stroke();ctx.restore();
  }
  const spacing=Math.max(6,(load>5?14:25)-Math.log2(level+1)*1.2);
  for(let offset=0;offset<total;offset+=spacing){
    const p=at((offset+time*(load>5?15:11))%total);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.fillStyle=offset%3===0?'#b6a16e':'#7c8f6a';ctx.fillRect(-1.6,-1.1,3.2,2.2);
    if(load>9){ctx.fillStyle='#55694f';ctx.fillRect(-3,1,2,1.8);}
    ctx.restore();
  }
}

/** Loose rubbish leaves the conveyors, drops below the rim and disappears inside. */
export function drawPitIntake(ctx:CanvasRenderingContext2D,w:number,city:CityState,level:number,time:number):void {
  if(level<4)return;
  const pit=DISTRICTS.find(d=>d.id==='pit')!;
  const cx=pit.x*w,cy=pit.y*w;
  ctx.save();
  let index=0;
  for(const id of plan().neighbours.get('pit')??[]){
    if(!city.owned.includes(id))continue;
    const d=DISTRICTS.find(d=>d.id===id)!;
    let dx=d.x-pit.x,dy=d.y+.045-pit.y;
    const length=Math.hypot(dx,dy);dx/=length;dy/=length;
    const radius=w*.115;
    const mouth:Point=[cx+dx*radius,cy+dy*radius];
    const start:Point=[cx+dx*(radius+12),cy+dy*(radius+12)];
    drawBelt(ctx,[start,mouth],12,level,time);
    const count=Math.min(18,3+Math.floor(Math.log2(level+1)*1.4));
    for(let j=0;j<count;j++){
      const t=(time*.46+j/count+index*.19)%1;
      const spread=Math.sin(j*7.3+index)*w*.007*(1-t);
      const x=cx+dx*radius*(1-t)-dy*spread;
      const y=cy+dy*radius*(1-t)+dx*spread+t*t*w*.016;
      const size=(2.2+(j%3)*.6)*(1-t*.7);
      ctx.globalAlpha=1-t*.86;ctx.fillStyle=j%3===0?'#b5a16e':'#78896a';
      ctx.save();ctx.translate(x,y);ctx.rotate(t*4+j);ctx.fillRect(-size/2,-size/2,size,size*.7);ctx.restore();
    }
    index++;
  }
  ctx.restore();
}

export interface DevelopedSpot { id: string; type: DistrictType; x: number; y: number; u: number; seed: number }
/** The camera uses the same structures, scaled by distance from its hill. */
export function drawDevelopedSpot(ctx: CanvasRenderingContext2D, sp: DevelopedSpot, level: number): void {
  if (level < 1) return;
  ctx.save(); ctx.translate(sp.x, sp.y - sp.u * .7); ctx.scale(sp.u / 6, sp.u / 6);
  plot(ctx, 0, 0, 36, 24, sp.type, level, sp.seed);
  ctx.restore();
}

export function drawTownGrowthLinks(ctx: CanvasRenderingContext2D, spots: readonly DevelopedSpot[], owned: readonly string[], level: number, time: number): void {
  if (level < 4) return;
  const byId = new Map(spots.map((sp) => [sp.id, sp]));
  ctx.save(); ctx.globalAlpha = .55;
  for (const {from,to,load} of routesFor(owned)) {
    const a = byId.get(from)!, b = byId.get(to)!;
    drawBelt(ctx, [[a.x,a.y], [b.x,b.y]], load, level, time);
  }
  ctx.restore();
}

export function drawTownGrowthIntake(ctx: CanvasRenderingContext2D, spots: readonly DevelopedSpot[], owned: readonly string[], level: number, time: number): void {
  if (level < 4) return;
  const pit = spots.find((sp) => sp.id === 'pit')!;
  const rw = pit.u * 4.6, rh = pit.u * 1.1;
  ctx.save();
  let index = 0;
  for (const id of plan().neighbours.get('pit') ?? []) {
    if (!owned.includes(id)) continue;
    const source = spots.find((sp) => sp.id === id)!;
    const dx = source.x - pit.x, dy = source.y - pit.y;
    const ratio = 1 / Math.sqrt(dx * dx / (rw * rw) + dy * dy / (rh * rh));
    const mx = dx * ratio, my = dy * ratio;
    drawBelt(ctx, [[pit.x+mx*1.2,pit.y+my*1.2], [pit.x+mx,pit.y+my]], 10, level, time);
    for (let j = 0; j < Math.min(12, 3 + Math.ceil(Math.log2(level + 1))); j++) {
      const t = (time * .46 + j * .13 + index * .17) % 1;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = j % 3 === 0 ? '#b5a16e' : '#78896a';
      const size = 2.5 - t * 1.5;
      ctx.fillRect(pit.x+mx*(1-t)-size*.5, pit.y+my*(1-t)+t*t*pit.u*.5, size, size*.7);
    }
    ctx.globalAlpha = 1; index++;
  }
  ctx.restore();
}

function plot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, type: DistrictType, level: number, seed: number): void {
  const tiers = Math.log2(level + 1);
  const industrial = type === 'prom' || type === 'boiler' || type === 'depot';
  const mainW = w * (industrial ? .46 : .37), dep = w * .10;
  const bodyH = 2 + tiers * (industrial ? 3.5 : 2.7);
  const gx = x - mainW * .65, gy = y + h * .20;
  ctx.lineWidth = .7;
  // Retaining pad and short fences keep the landfill visible around the machinery.
  ctx.fillStyle = '#12271b'; ctx.fillRect(x - w * .39, y - h * .25, w * .75, h * .56);
  ctx.strokeStyle = '#46624a';
  ctx.strokeRect(x - w * .39, y - h * .25, w * .75, h * .56);
  if (level < 4) {
    ctx.strokeStyle = '#637355';
    for (let j = 0; j < 4; j++) {
      const px = x - w * .34 + j * w * .21;
      ctx.beginPath(); ctx.moveTo(px, y + h * .24); ctx.lineTo(px, y + h * .12); ctx.stroke();
    }
    block(ctx, gx, gy, mainW * .7, dep, 4, 1, seed);
    if (level >= 2) block(ctx, x + w * .08, gy, w * .20, dep * .7, 3, 1, seed + 1, true);
    if (level >= 3) {
      block(ctx, gx, gy - 4, mainW * .55, dep * .6, 3, 1, seed + 2, true);
      ctx.strokeStyle = '#7a8f70'; ctx.beginPath(); ctx.moveTo(x + w * .30, gy); ctx.lineTo(x + w * .30, gy - h * .35); ctx.stroke();
    }
  } else {
    const tall = bodyH * (1 + (seed % 3) * .10);
    const building = (px: number, py: number, bw: number, ht: number, rows = Math.ceil(tiers), storage = false) => block(ctx, px, py, bw, dep, ht, rows, seed, storage);
    const pipe = (px: number, bottom: number, ht: number, radius: number) => {
      ctx.fillStyle = '#294232'; ctx.fillRect(px - radius, bottom - ht, radius * 2, ht);
      ctx.strokeStyle = '#71816a'; ctx.lineWidth = .65; ctx.beginPath();ctx.moveTo(px-radius,bottom);ctx.lineTo(px-radius,bottom-ht);ctx.stroke();
      ctx.beginPath();ctx.ellipse(px,bottom-ht,radius,radius*.45,0,0,Math.PI*2);ctx.fillStyle='#51644b';ctx.fill();ctx.stroke();
    };
    switch (type) {
      case 'live':
      case 'dump':
        for (let j = 0; j < 3; j++) building(x - w * .36 + j * w * .22, gy - (j % 2) * 2, w * .18, tall * (.55 + (seed + j) % 3 * .16), Math.ceil(tiers), true);
        if (level >= 16) { ctx.strokeStyle='#76866b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-w*.34,gy-tall*.6);ctx.lineTo(x+w*.27,gy-tall*.6);ctx.stroke(); }
        break;
      case 'boiler':
        building(x-w*.32,gy,w*.55,tall*.48,2);
        pipe(x-w*.18,gy-tall*.25,tall*.95,w*.07);
        pipe(x+w*.09,gy-tall*.15,tall*1.20,w*.055);
        if(level>=16)pipe(x+w*.29,gy,tall*.70,w*.045);
        break;
      case 'prom':
        building(x-w*.37,gy,w*.58,tall*.70,Math.ceil(tiers*.7),true);
        pipe(x+w*.24,gy-tall*.24,tall*1.15,w*.045);
        if(level>=16){
          ctx.strokeStyle='#7a8967';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-w*.35,gy-tall);ctx.lineTo(x+w*.34,gy-tall);ctx.lineTo(x+w*.34,gy);ctx.moveTo(x-w*.28,gy);ctx.lineTo(x-w*.28,gy-tall);ctx.moveTo(x+w*.03,gy-tall);ctx.lineTo(x+w*.03,gy-tall*.65);ctx.stroke();
        }
        break;
      case 'depot':
      case 'station':
        building(x-w*.36,gy-h*.1,w*.64,tall*.33,1,true);
        ctx.strokeStyle='#65745a';ctx.lineWidth=.7;
        for(let j=0;j<2;j++){const yy=gy+3+j*3;ctx.beginPath();ctx.moveTo(x-w*.42,yy);ctx.lineTo(x+w*.43,yy);ctx.stroke();}
        for(let j=0;j<(level>=16?3:2);j++)building(x-w*.30+j*w*.21,gy+4,w*.15,3,1,true);
        break;
      case 'river':
        ctx.fillStyle='#102c27';ctx.fillRect(x-w*.43,y-h*.24,w*.86,h*.48);
        ctx.strokeStyle='#4c7a70';ctx.lineWidth=.5;
        for(let j=0;j<4;j++){ctx.beginPath();ctx.moveTo(x-w*.4,y-h*.16+j*h*.11);ctx.lineTo(x+w*.4,y-h*.16+j*h*.11);ctx.stroke();}
        building(x-w*.40,gy,w*.21,tall*.65,2);
        building(x+w*.20,gy-h*.07,w*.17,tall*.4,1);
        ctx.strokeStyle='#8b9374';ctx.lineWidth=level>=16?3:2;ctx.beginPath();ctx.moveTo(x-w*.20,gy-tall*.35);ctx.lineTo(x+w*.25,gy-tall*.35);ctx.stroke();
        break;
      case 'church':
        building(x-w*.26,gy,w*.40,tall*.6,1);
        pipe(x-w*.05,gy-tall*.5,tall*.6,w*.10);
        ctx.strokeStyle='#9aab86';ctx.beginPath();ctx.moveTo(x-w*.05,gy-tall*1.35);ctx.lineTo(x-w*.05,gy-tall*.95);ctx.moveTo(x-w*.13,gy-tall*1.20);ctx.lineTo(x+w*.03,gy-tall*1.20);ctx.stroke();
        break;
      case 'cemetery':
        building(x-w*.36,gy,w*.19,tall*.3,1,true);
        ctx.strokeStyle='#73836a';
        for(let j=0;j<6;j++){const xx=x-w*.04+(j%3)*w*.14,yy=gy-Math.floor(j/3)*h*.19;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx,yy-5);ctx.moveTo(xx-2,yy-3.5);ctx.lineTo(xx+2,yy-3.5);ctx.stroke();}
        break;
      case 'market':
        for(let j=0;j<3;j++){building(x-w*.37+j*w*.24,gy,w*.19,tall*(.35+j*.12),1,true);}
        if(level>=16)building(x-w*.29,gy-tall*.5,w*.52,3,1,true);
        break;
      case 'school':
        building(x-w*.33,gy,w*.43,tall,Math.ceil(tiers));
        building(x+w*.10,gy,w*.22,tall*.48,2);
        ctx.strokeStyle='#95aa85';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x-w*.12,gy-tall);ctx.lineTo(x-w*.12,gy-tall-6);ctx.moveTo(x-w*.20,gy-tall-4);ctx.lineTo(x,gy-tall-4);ctx.stroke();
        break;
      case 'hospital':
        building(x-w*.30,gy,w*.48,tall*.7,Math.ceil(tiers*.7));
        ctx.fillStyle='#92a681';ctx.fillRect(x-w*.10,gy-tall*.7-3,5,1);ctx.fillRect(x-w*.10+2,gy-tall*.7-5,1,5);
        break;
      default:
        building(gx,gy,mainW,tall,Math.ceil(tiers));
        building(x+w*.1,gy,w*.22,tall*.48,Math.ceil(tiers*.5),true);
        if(level>=16)building(gx+mainW*.15,gy-tall,mainW*.5,tiers*1.25,1,true);
    }
    if (level >= 16 && seed % 5 === 0) {
      ctx.strokeStyle='#6b8068';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x-w*.17,gy);ctx.lineTo(x-w*.17,gy-tall*1.3);ctx.moveTo(x-w*.17,gy-tall*1.3);ctx.lineTo(x+w*.2,gy-tall*.85);ctx.stroke();
    }
  }

  // Small type cues preserve the identity of the district after it is buried.
  if (type === 'church' || type === 'cemetery') {
    ctx.strokeStyle = '#9aab86'; ctx.beginPath(); ctx.moveTo(x + w * .30, y); ctx.lineTo(x + w * .30, y - h * .18);
    ctx.moveTo(x + w * .24, y - h * .12); ctx.lineTo(x + w * .36, y - h * .12); ctx.stroke();
  }
  const lampX = x - w * .33, lampY = y + h * .25;
  ctx.strokeStyle = '#60785e'; ctx.beginPath(); ctx.moveTo(lampX, lampY); ctx.lineTo(lampX, lampY - 6); ctx.lineTo(lampX + 3, lampY - 6); ctx.stroke();
  ctx.fillStyle = '#c5ae77'; ctx.fillRect(lampX + 2, lampY - 6, 2, 1);
  if (level >= 16 && seed % 6 === 2) {
    ctx.fillStyle = '#785442'; ctx.fillRect(x + w * .22, gy - bodyH * .4, 1, 1);
  }
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, floors: number, seed: number, storage = false): void {
  const polygon = (points: Point[], fill: string) => {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#617a63'; ctx.lineWidth = .65; ctx.stroke();
  };
  polygon([[x,y],[x+w,y],[x+w,y-h],[x,y-h]], '#234330');
  polygon([[x+w,y],[x+w+d,y-d*.6],[x+w+d,y-h-d*.6],[x+w,y-h]], '#142b1e');
  polygon([[x,y-h],[x+w,y-h],[x+w+d,y-h-d*.6],[x+d,y-h-d*.6]], '#465f48');
  for (let row = 0; row < floors; row++) {
    const yy = y - (row + .5) * h / floors;
    ctx.strokeStyle = '#4e6a53'; ctx.lineWidth = .45; ctx.beginPath(); ctx.moveTo(x + 1, yy + 1); ctx.lineTo(x + w - 1, yy + 1); ctx.stroke();
    for (let col = 0; col < 3; col++) {
      ctx.fillStyle = storage ? '#536a52' : (row + col + seed) % 5 === 0 ? '#b3a16c' : '#678c70';
      ctx.fillRect(x + 2 + col * (w - 4) / 3, yy - .5, Math.max(1, w / 8), 1.2);
    }
  }
}
