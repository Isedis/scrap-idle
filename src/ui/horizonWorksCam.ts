import { HALLS,buildTargets,nodeCost,type HorizonState } from '../game/horizon';

export const WORK_REGIONS:number[][][]=[[],
  [[68,277,291,34],[111,182,219,89],[358,137,70,131],[176,55,112,104]],
  [[192,79,97,122],[40,192,136,103],[311,190,135,107],[184,35,112,42]],
  [[139,278,267,35],[157,80,191,191],[66,190,76,82],[353,208,76,65]],
  [[145,280,272,33],[153,98,44,179],[363,98,43,179],[175,62,202,37],[203,110,153,158]],
];
export function pickWork(hall:number,x:number,y:number):number|null {
  const regions=WORK_REGIONS[hall]??[];
  const hits=regions.map(([a,b,w,h],i)=>({i,inside:x>=a&&x<=a+w&&y>=b&&y<=b+h,area:w*h})).filter(r=>r.inside).sort((a,b)=>a.area-b.area);
  return hits[0]?.i??null;
}
export interface WorksView {state:HorizonState;hall:number;selected:number;shares?:number[];powerFill?:number;inspected?:boolean}

/** The same 480x360 cavern scale and muted metal palette as the receiving gallery. */
export function drawWorks(ctx:CanvasRenderingContext2D,v:WorksView,width:number,height:number,time:number,reduced:boolean,door:number,kick=0):void {
  const s=v.state,hall=v.hall,archived=hall<s.opened,t=reduced?0:time;
  const p=(i:number)=>archived?1:Math.max(0,Math.min(1,s.work[i]?.div(nodeCost(s,i)).toNumber()??0));
  const active=!archived&&s.autoBuild&&s.mode!=='growth'&&buildTargets(s).length>0;
  const targets=archived?[]:buildTargets(s);
  const metal='#304d3a',edge='#5a7a5f',lit='#9ab493',dim='#213c2c',dark='#10271d',amber='#c4ae70';
  ctx.save();ctx.scale(width/480,height/360);ctx.imageSmoothingEnabled=false;
  const box=(x:number,y:number,w:number,h:number,c=metal)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
  const line=(x:number,y:number,a:number,b:number,c=edge,w=1)=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();};
  const poly=(points:number[][],c:string)=>{ctx.fillStyle=c;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
  const block=(x:number,y:number,w:number,h:number,c=metal)=>{box(x,y,w,h,c);poly([[x,y],[x+8,y-6],[x+w+8,y-6],[x+w,y]],edge);poly([[x+w,y],[x+w+8,y-6],[x+w+8,y+h-6],[x+w,y+h]],dim);line(x,y,x,y+h,edge);};
  const ring=(x:number,y:number,r:number,c=edge,w=3)=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();};
  const bolts=(x:number,y:number,count:number,step:number)=>{for(let n=0;n<count;n++)box(x+n*step,y,3,3,lit);};
  const belt=(x:number,y:number,a:number,b:number,progress:number,move:boolean,speed=.1)=>{
    if(progress<=0)return;const dx=(a-x)*progress,dy=(b-y)*progress;
    line(x+2,y+8,x+dx+2,y+dy+8,'#06130d',16);line(x,y,x+dx,y+dy,metal,12);
    line(x,y-6,x+dx,y+dy-6,edge,2);line(x,y+6,x+dx,y+dy+6,edge,2);
    const len=Math.hypot(dx,dy),count=Math.max(2,Math.floor(len/17));
    for(let n=0;n<=count;n++){const q=n/count;line(x+dx*q-2,y+dy*q-5,x+dx*q+2,y+dy*q+5,'#47674b',2);}
    if(move)for(let n=0;n<4;n++){const q=reduced?(n+.3)/4:(t*speed+n/4)%1;block(x+dx*q-4,y+dy*q-10,9,5,n%2?'#6c7e59':'#4d6b4a');}
  };
  // Depth is kept behind the equipment: ribs, wall courses, lamps and a narrow distant passage.
  box(0,0,480,360,'#04100b');
  for(let n=4;n>=0;n--){const x=38+n*39,y=24+n*7;box(x,y,423-n*64,258-n*5,n%2?'#0b1a13':'#102219');line(x,y,x,279-n*4,'#233c2c',4);line(x,y,464-n*16,y,'#263f30',6);}
  for(let y=58;y<277;y+=24)line(24,y,466,y,'#172e22');
  const glow=ctx.createRadialGradient(240,135,20,240,170,245);glow.addColorStop(0,'rgba(106,142,105,.14)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,480,340);
  box(0,280,480,80,'#08160f');for(let n=0;n<11;n++)line(225+n*5,277,n*60-70,360,'#284131');line(0,323,480,323,'#213b2a');
  box(409,65,48,212,'#020a07');for(let n=3;n>=0;n--){line(410+n*4,66+n*7,456-n*4,66+n*7,dim,2);line(410+n*4,66+n*7,410+n*4,273-n*3,dim,2);}
  const open=Math.max(0,Math.min(1,door));
  box(412-open*17,72,20,199,'#263e2d');box(435+open*17,72,19,199,'#1c3526');
  for(let y=82;y<266;y+=21){line(413-open*17,y,431-open*17,y,edge);line(437+open*17,y,452+open*17,y,'#3a5941');}
  block(403,277,61,6);line(412-open*17,72,412-open*17,270,edge);
  for(const x of [69,184,307,447]){box(x-8,43,17,4);box(x-6,47,12,2,'#9aa887');}

  if(hall===1){
    // A lifting gantry: the bed, power cabinet and overhead winch are separate real projects.
    block(73,288,281*p(0),10);if(p(0)>0){for(const x of [86,327]){const rise=183*p(0);block(x,281-rise,12,rise);line(x+4,281-rise,x+4,281,edge,2);}}
    if(p(0)>.6){block(79,93,270,13);bolts(94,99,11,22);}
    const lift=p(1)>=.99&&p(2)>=.99&&(archived||active)?(reduced?9:(Math.sin(t*.7)+1)*12):0,bedY=243-lift;
    if(p(1)>0){block(119,bedY,196*p(1),16,'#435e43');line(121,bedY-1,317,bedY-1,lit,2);for(const x of [131,294]){line(x,bedY+17,x+18,281,edge,4);line(x+18,bedY+17,x,281,dim,4);}
      if(p(1)>.55){block(145,bedY-31,51,28,'#4e6449');line(149,bedY-25,187,bedY-9,edge,2);block(210,bedY-18,74,15,'#607657');}}
    if(p(2)>0){block(364,254-p(2)*91,45,p(2)*91);if(p(2)>.95){box(370,173,31,42,dark);for(let n=0;n<3;n++)box(375+n*8,181,4,5,p(2)>=.99?'#99b88d':edge);for(let n=0;n<4;n++)line(376,197+n*4,395,197+n*4,edge);line(364,243,344,243,edge,3);}}
    if(p(3)>0){block(192,75,72*p(3),37);if(p(3)>.8){ring(228,93,13,lit);for(let n=0;n<4;n++){const a=n*Math.PI/2+(reduced||p(3)<.99?0:t*.2);line(228,93,228+Math.cos(a)*10,93+Math.sin(a)*10,edge,2);}}
      if(p(3)>.6){for(const x of [210,246])line(x,112,x,bedY-50,lit,2);block(205,bedY-50,46,9);line(227,bedY-40,221,bedY-29,edge,3);}}
    if(s.recipe==='precise'&&p(2)>.5){line(134,177,299,177,lit,3);for(let n=0;n<5;n++){block(143+n*31,181,12,15);box(146+n*31,197,6,3,'#a6bda2');}}
    else if(p(1)>.65){const loadY=bedY-(p(3)>.6?47:32);for(let n=0;n<3;n++){block(137,loadY-n*9,145,6,'#4d684a');line(144+n*33,loadY+6,144+n*33,loadY-29,edge,3);}}
    belt(25,309,356,309,p(0),archived||active);
  }
  if(hall===2){
    // One hopper feeds two differently shaped workshops; the actual shares drive traffic speed.
    if(p(0)>0){block(207,278,71*p(0),9);for(const x of [214,265])block(x,273-128*p(0),8,128*p(0));}
    if(p(0)>.35){poly([[194,112],[281,112],[263,160],[212,160]],metal);block(190,105,92,9);line(214,159,214,183,edge,5);line(260,159,260,183,edge,5);for(let n=0;n<7;n++)block(205+(n%3)*18,100-Math.floor(n/3)*6,15,5,'#687c58');}
    const share=(id:number)=>archived?.5:v.shares?.[targets.indexOf(id)]??.5;
    belt(239,184,99,254,p(1),(archived||active&&targets.includes(1))&&p(1)>.25,.3*share(1));
    belt(244,184,375,254,p(2),(archived||active&&targets.includes(2))&&p(2)>.25,.3*share(2));
    if(p(1)>0){block(48,285,111*p(1),12);if(p(1)>.2){block(59,278-p(1)*64,83,p(1)*64);if(p(1)>.95){box(65,217,67,38,dark);for(const x of [81,113]){ring(x,237,14,edge);const a=reduced||p(1)<.99?0:t;line(x,237,x+Math.cos(a)*10,237+Math.sin(a)*10,lit,2);}block(69,266,59,9);}}}
    if(p(2)>0){block(321,285,112*p(2),12);if(p(2)>.2){for(const x of [333,405])block(x,278-p(2)*78,9,p(2)*78);if(p(2)>.95){block(331,203,86,9);for(let n=0;n<4;n++){line(345+n*18,216,345+n*18,269,edge,3);box(342+n*18,242,7,12,'#759a73');}block(344,273,62,8);}}}
    if(p(3)>0){line(96,76,96+286*p(3),76,edge,4);block(202,49,72*p(3),28);if(p(3)>.6)for(let n=0;n<4;n++)box(209+n*15,57,8,8,p(3)>=.99?lit:edge);}
    if(s.dispatcher){block(209,228,55,36);box(215,234,43,22,dark);for(let n=0;n<3;n++)box(221+n*11,240,6,6,'#a3bd92');line(237,227,237,179,edge,3);}
  }
  if(hall===3){
    // Flywheel on a cast foundation, a side motor and a linear stop; energy is a separate rack.
    block(145,291,250*p(0),13);if(p(0)>0){ctx.strokeStyle=edge;ctx.lineWidth=7;ctx.beginPath();ctx.ellipse(255,282,89*p(0),17,0,0,Math.PI*2);ctx.stroke();}
    if(p(1)>0){for(const x of [194,307]){poly([[x,282],[x+19,282],[x+9,206]],metal);line(x+2,280,x+9,213,edge,2);}
      const spin=p(1)>=.99&&p(2)>=.99&&(archived||active),angle=reduced?0:t*(s.powerMode==='charge'?.25:.65)*(spin?1:0)+kick*3;
      ring(264,178,81,'#173021',12);ctx.strokeStyle=edge;ctx.lineWidth=8;ctx.beginPath();ctx.arc(257,174,80,-Math.PI/2,-Math.PI/2+Math.PI*2*p(1));ctx.stroke();
      if(p(1)>.3){ring(257,174,62,dim,5);for(let n=0;n<8;n++)if(p(1)>n/8){const a=angle+n*Math.PI/4;line(257+Math.cos(a)*14,174+Math.sin(a)*14,257+Math.cos(a)*73,174+Math.sin(a)*73,kick>0?amber:edge,6);}block(246,164,22,20,'#617c58');}
      for(let n=0;n<24;n++)if(p(1)>n/24){const a=angle+n*Math.PI/12;box(253+Math.cos(a)*83,170+Math.sin(a)*83,7,7,metal);}}
    if(p(2)>0){block(72,269-p(2)*49,59,p(2)*49);if(p(2)>.95){ring(101,244,17,edge);ring(101,244,8,lit);line(115,230,233,177,edge,4);line(112,256,239,188,dim,4);bolts(77,264,4,12);}}
    if(p(3)>0){block(358,264-p(3)*36,58,p(3)*36);if(p(3)>.95){block(347,228,72,9);line(349,240,305,212,kick>0?amber:edge,7);block(367,247,25,10);}}
    block(29,112,28,164);box(35,121,16,147,dark);const fill=archived?0:v.powerFill??0;box(36,264-fill*137,14,fill*137,'#afa06c');for(let n=0;n<7;n++)line(33,130+n*20,53,130+n*20,edge);line(57,263,77,263,kick>0?amber:edge,4);
    if(s.regulator){block(380,143,38,49);box(386,149,26,29,dark);for(let n=0;n<3;n++)box(390+n*7,156,4,5,lit);line(384,193,384,218,edge,3);}
  }
  if(hall===4){
    // Four incoming services converge on a single large coupling, held by separately built frames.
    for(let n=0;n<4;n++){const y=88+n*39;block(31,y,61,25);box(37,y+5,45,12,dark);line(42,y+10,73,y+10,edge,3);bolts(39,y+21,4,11);}
    block(151,292,257*p(0),13);if(p(0)>.5)bolts(164,299,13,18);
    for(const [id,x] of [[1,162],[2,373]])if(p(id)>0){block(x,285-p(id)*175,15,p(id)*175);for(let n=0;n<6;n++)if(p(id)>n/6){line(x+4,276-n*28,x+11,259-n*28,edge,2);}if(p(id)>.95){line(x+8,119,x<200?218:337,141,edge,9);}}
    if(p(3)>0){block(169,96,220*p(3),16);if(p(3)>.8){bolts(184,102,Math.floor(11*p(3)),18);line(211,113,211,130,edge,4);line(345,113,345,130,edge,4);}}
    const feed=s.opened===5||!!(s.finalChecks&1)||s.trial?.kind==='feed';
    for(let n=0;n<4;n++){const y=101+n*39,ready=p(1)>=.99&&p(2)>=.99;line(94,y,207,163+n*13,ready?edge:dim,5);if(feed&&ready){line(94,y,207,163+n*13,'#7f9f72',2);if(!reduced){const q=(t*.15+n/4)%1;box(94+113*q,y+(163+n*13-y)*q,6,4,lit);}}}
    if(p(4)>0){const running=s.opened===5||s.trial?.kind==='drive',angle=reduced?0:t*(running?.7:0);ring(282,197,64,dim,15);ctx.strokeStyle=edge;ctx.lineWidth=9;ctx.beginPath();ctx.arc(274,190,64,-Math.PI/2,-Math.PI/2+2*Math.PI*p(4));ctx.stroke();
      if(p(4)>.35){ring(274,190,48,metal,5);for(let n=0;n<8;n++)if(p(4)>n/8){const a=angle+n*Math.PI/4;line(274+Math.cos(a)*13,190+Math.sin(a)*13,274+Math.cos(a)*55,190+Math.sin(a)*55,running?'#93ad7d':edge,6);}block(262,180,25,22,'#607b55');}
      if(p(4)>.7){line(213,229,206,280,edge,7);line(327,229,338,280,edge,7);}}
    block(355,252,55,30);box(362,258,41,16,dark);for(let n=0;n<2;n++)box(368+n*17,262,9,6,s.finalChecks&(1<<n)?'#b1c99a':edge);
    if(s.trial){box(357,289,50,4,dim);box(357,289,50*(1-s.trial.left/s.trial.duration),4,amber);}
  }
  // Installation activity stays at the real active job; equipment does not animate before it exists.
  if(active&&targets.length){const id=targets[0],r=WORK_REGIONS[hall]?.[id];if(r){const x=r[0]+r[2]/2;block(x-11,321,23,9);box(x-7,330,4,4,edge);box(x+7,330,4,4,edge);line(x,321,x+8,308,amber,2);if(!reduced)for(let n=0;n<3;n++)box(x+Math.sin(t*9+n)*6,306+Math.cos(t*8+n)*4,2,2,amber);}}
  if(!archived&&v.selected>=0&&(v.inspected||active&&targets.includes(v.selected))){const r=WORK_REGIONS[hall]?.[v.selected];if(r){ctx.strokeStyle='rgba(196,174,112,.6)';ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.strokeRect(r[0]-3,r[1]-3,r[2]+6,r[3]+6);ctx.setLineDash([]);}}
  const shade=ctx.createRadialGradient(240,182,125,240,182,310);shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.72)');ctx.fillStyle=shade;ctx.fillRect(0,0,480,360);
  box(0,345,480,15,'#04100a');ctx.font='9px monospace';ctx.fillStyle='#829c81';ctx.textAlign='left';ctx.fillText(archived?'СИСТЕМА ПОД НАГРУЗКОЙ':active?'МОНТАЖНЫЙ УЧАСТОК':HALLS[hall].name.toUpperCase(),12,355);ctx.textAlign='right';ctx.fillText(`ЗАЛ 0${hall+1} / 05`,468,355);
  ctx.restore();
}
