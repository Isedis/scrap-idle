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
export function drawCityGrowth(ctx: CanvasRenderingContext2D, w: number, cells: Point[][], city: CityState, level: number, time: number, identity: (type: DistrictType, x: number, y: number, size: number) => void): void {
  if (level < 1) return;
  ctx.save();
  const centers = new Map(DISTRICTS.map((d) => [d.id, [d.x * w, (d.y + .07) * w] as Point]));
  const pit = DISTRICTS.find(d => d.id === 'pit')!;
  centers.set('pit', [pit.x * w, pit.y * w]);
  const routes: [Point, Point, number][] = routesFor(city.owned).map(({from,to,load})=>[centers.get(from)!,centers.get(to)!,load]);
  for (let i = 0; i < DISTRICTS.length; i++) {
    const d = DISTRICTS[i];
    if (!city.owned.includes(d.id) || d.type === 'pit') continue;
    const cell = cells[i];
    const xs = cell.map((p) => p[0]), ys = cell.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    ctx.save(); ctx.beginPath(); cell.forEach((p, j) => j ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.clip();
    additions(ctx, d.x * w, d.y * w, Math.min(bw, w * .155), Math.min(bh, w * .19), d.type, level, i);
    // The same landmark is retained before and after annexation and development.
    identity(d.type, d.x * w, d.y * w - w * .008, w * .045);
    ctx.restore();
  }
  if (level >= 4) {
    for (const [a, b, load] of routes) {
      const edge = a[0] + (b[0] >= a[0] ? 1 : -1) * w * .05;
      drawBelt(ctx, b === centers.get('pit') ? [a,b] : [a,[edge,a[1]],[edge,b[1]],b], load, level, time);
    }
  }
  ctx.restore();
}

/** A terminal conveyor: visible chevrons and pieces all travel from the district toward the pit. */
function drawBelt(ctx: CanvasRenderingContext2D, points: Point[], load: number, level: number, time: number, size = 1): void {
  ctx.save(); ctx.scale(size,size);
  points = points.map(([x,y]): Point => [x/size,y/size]);
  const width = Math.min(12, 4.5 + Math.log2(load + 1) * 1.15 + Math.min(2, Math.log2(level + 1) * .25));
  const path = () => { ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p)); };
  ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = '#020805'; ctx.lineWidth = width + 3; ctx.stroke();
  path(); ctx.strokeStyle = load > 5 ? '#9ba683' : '#718465'; ctx.lineWidth = width; ctx.stroke();
  path(); ctx.strokeStyle = '#1c2b1d'; ctx.lineWidth = width - 2; ctx.stroke();
  const lengths = points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  const total = lengths.reduce((a,b)=>a+b,0);
  if (total < 2) { ctx.restore(); return; }
  const at = (distance:number) => {
    let segment=0;
    while(segment<lengths.length-1&&distance>lengths[segment])distance-=lengths[segment++];
    const a=points[segment],b=points[segment+1],t=distance/Math.max(1,lengths[segment]);
    return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,angle:Math.atan2(b[1]-a[1],b[0]-a[0])};
  };
  // Belt slats and static chevrons remain readable without animation.
  for(let distance=4;distance<total;distance+=8){
    const p=at((distance+time*18)%total);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.strokeStyle='#52634b';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(0,-width*.35);ctx.lineTo(0,width*.35);ctx.stroke();ctx.restore();
  }
  for(let distance=12;distance<total-3;distance+=24){
    const p=at(distance);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.strokeStyle='#c4b17d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-3,-2.5);ctx.lineTo(0,0);ctx.lineTo(-3,2.5);ctx.stroke();ctx.restore();
  }
  const spacing = Math.max(12,(load>5?23:34)-Math.log2(level+1));
  for(let index=0,offset=0;offset<total;offset+=spacing,index++){
    const p=at((offset+time*(load>5?21:16))%total);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.strokeStyle='#bec4a0';ctx.lineWidth=.7;
    if(index%3===0){
      ctx.fillStyle='#cabd92';ctx.fillRect(-2.8,-1.8,5.6,3.6);ctx.strokeStyle='#7c795d';ctx.beginPath();ctx.moveTo(-1,-1.5);ctx.lineTo(1.8,1.5);ctx.stroke();
    }else if(index%3===1){
      ctx.fillStyle='#72865d';ctx.beginPath();ctx.moveTo(-2.5,-1.5);ctx.lineTo(-.5,-2.3);ctx.lineTo(2,-1.5);ctx.lineTo(2.5,1.6);ctx.lineTo(-2,2);ctx.closePath();ctx.fill();ctx.stroke();
    }else{
      ctx.fillStyle='#9ca98c';ctx.beginPath();ctx.ellipse(0,0,2.8,1.7,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
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
    let dx=d.x-pit.x,dy=d.y+.07-pit.y;
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
  additions(ctx, 0, 0, 36, 24, sp.type, level, sp.seed);
  ctx.restore();
}

export function drawTownGrowthLinks(ctx: CanvasRenderingContext2D, spots: readonly DevelopedSpot[], owned: readonly string[], level: number, time: number): void {
  if (level < 4) return;
  const byId = new Map(spots.map((sp) => [sp.id, sp]));
  ctx.save(); ctx.globalAlpha = .95;
  for (const {from,to,load} of routesFor(owned)) {
    const a = byId.get(from)!, b = byId.get(to)!;
    const start: Point = [a.x, a.y + a.u * .6];
    const end: Point = b.id === 'pit' ? [b.x,b.y] : [b.x,b.y+b.u*.6];
    const edge = a.x + (b.x>=a.x?1:-1)*a.u*2.8;
    drawBelt(ctx, b.id === 'pit' ? [start,end] : [start,[edge,start[1]],[edge,end[1]],end], load, level, time, Math.max(.45,Math.min(.8,(a.u+b.u)/24)));
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
    drawBelt(ctx, [[pit.x+mx*1.2,pit.y+my*1.2], [pit.x+mx,pit.y+my]], 10, level, time, Math.min(.8,pit.u/12));
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

/** Waste-handling additions live at the edges; the original landmark occupies the centre. */
function additions(ctx: CanvasRenderingContext2D,x:number,y:number,w:number,h:number,type:DistrictType,level:number,seed:number):void {
  const tier=Math.log2(level+1), stack=Math.min(5,1+Math.floor(tier/2));
  const ground=y+h*.34, unit=Math.max(3,w*.16);
  ctx.save();
  if(type==='river'){
    ctx.fillStyle='#102b28';ctx.fillRect(x-w*.4,y-h*.13,w*.8,h*.22);
    ctx.strokeStyle='#557e70';ctx.lineWidth=.7;
    for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(x-w*.38,y-h*.09+j*h*.07);ctx.lineTo(x+w*.38,y-h*.09+j*h*.07);ctx.stroke();}
    ctx.fillStyle='#495a42';ctx.fillRect(x-w*.18,y-h*.16,w*.14,h*.34);
  }
  const bale=(bx:number,by:number,rows:number)=>{
    for(let i=0;i<rows;i++){
      const yy=by-i*3.5;
      ctx.fillStyle=i%2?'#384b32':'#2b402a';ctx.fillRect(bx,yy-3,unit,3.3);
      ctx.strokeStyle='#758362';ctx.lineWidth=.6;ctx.strokeRect(bx,yy-3,unit,3.3);
      ctx.strokeStyle='#a0a986';ctx.beginPath();ctx.moveTo(bx+unit*.32,yy-3);ctx.lineTo(bx+unit*.32,yy);ctx.moveTo(bx+unit*.7,yy-3);ctx.lineTo(bx+unit*.7,yy);ctx.stroke();
    }
  };
  bale(x-w*.40,ground,stack);
  if(level>=2)bale(x+w*.23,ground,Math.max(1,stack-1));
  if(type==='live'||type==='dump'||type==='cemetery'){
    for(let j=0;j<Math.min(4,level);j++){
      const bx=x-w*.17+j*w*.11;
      ctx.fillStyle=['#53634a','#344a35','#7a7957'][j%3];ctx.beginPath();ctx.moveTo(bx-2,ground);ctx.lineTo(bx-3,ground-3);ctx.lineTo(bx,ground-5-(seed%2));ctx.lineTo(bx+2,ground-2);ctx.closePath();ctx.fill();
    }
  }
  if(level>=3){
    ctx.strokeStyle='#6d8161';ctx.lineWidth=.8;ctx.beginPath();
    ctx.moveTo(x-w*.42,ground+1);ctx.lineTo(x-w*.42,ground-h*.32);ctx.moveTo(x-w*.42,ground-h*.32);ctx.lineTo(x-w*.20,ground-h*.32);ctx.stroke();
    ctx.fillStyle='#b7a371';ctx.fillRect(x-w*.23,ground-h*.32,2,1);
  }
  if(level>=4){
    if(type==='prom'||type==='boiler'||type==='river'){
      ctx.strokeStyle='#8a9976';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+w*.38,ground);ctx.lineTo(x+w*.38,ground-h*.42);ctx.lineTo(x+w*.2,ground-h*.42);ctx.stroke();
    }else if(type==='station'||type==='depot'){
      ctx.strokeStyle='#627459';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x-w*.4,ground+1);ctx.lineTo(x+w*.4,ground+1);ctx.moveTo(x-w*.4,ground+4);ctx.lineTo(x+w*.4,ground+4);ctx.stroke();
      ctx.fillStyle='#7d896b';ctx.fillRect(x-w*.2,ground-2,w*.22,4);ctx.fillStyle='#b5a36d';ctx.fillRect(x,ground-1,1.5,1);
    }else{
      ctx.fillStyle='#253d2b';ctx.fillRect(x+w*.28,ground-h*.35,unit*.8,h*.23);ctx.strokeStyle='#7b8f6e';ctx.lineWidth=.6;ctx.strokeRect(x+w*.28,ground-h*.35,unit*.8,h*.23);
    }
  }
  if(level>=8){
    const height=Math.min(h*.40,6+tier*1.5);
    ctx.strokeStyle='#718365';ctx.lineWidth=.8;ctx.beginPath();
    ctx.moveTo(x-w*.43,ground);ctx.lineTo(x-w*.43,ground-height);ctx.lineTo(x+w*.40,ground-height);ctx.lineTo(x+w*.40,ground);ctx.stroke();
    ctx.strokeStyle='#394f39';ctx.beginPath();ctx.moveTo(x-w*.40,ground-height+2);ctx.lineTo(x+w*.37,ground-height+2);ctx.stroke();
  }
  if(level>=16){
    bale(x-w*.39,ground,stack+1);
    ctx.strokeStyle='#a3aa83';ctx.beginPath();ctx.moveTo(x+w*.38,ground-h*.35);ctx.lineTo(x+w*.38,ground-h*.6);ctx.stroke();
  }
  ctx.restore();
}
