import { type LabState, type LabModule } from '../game/horizonLab';

const REGIONS:Record<LabModule,[number,number,number,number]>={winch:[70,82,102,205],press:[205,164,104,131],frame:[330,57,124,220],relay:[213,65,90,78]};
export function pickLabModule(x:number,y:number):LabModule|null {
  return (Object.keys(REGIONS) as LabModule[]).find(id=>{const [a,b,w,h]=REGIONS[id];return x>=a&&x<=a+w&&y>=b&&y<=b+h;})??null;
}

/** Physical first hall: all material motion is gated by actual stock, shipment or work. */
export function drawLab(ctx:CanvasRenderingContext2D,s:LabState,width:number,height:number,reduced=false,selected:LabModule|null=null):void {
  ctx.save();ctx.scale(width/480,height/360);ctx.imageSmoothingEnabled=false;
  const box=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
  const line=(x:number,y:number,a:number,b:number,color:string,w=1)=>{ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();};
  const progress=(id:LabModule)=>s.built[id]?1:s.job?.id===id?1-s.job.left/s.job.duration:0;
  const active=s.raw.gt(1e-8),phase=reduced?0:s.elapsed;
  const edge='#5a7a5f',lit='#9ab493',metal='#304d3a',shadow='#10271d',dim='#213c2c',amber='#c4ae70';
  box(0,0,480,360,'#04100b');
  // A high service cavern: receding bays, a shaft on the left, a massive sealed structure on the right.
  for(let i=4;i>=0;i--){
    const x=52+i*38,y=19+i*7;box(x,y,410-i*55,258-i*6,i%2?'#0b1a13':'#102219');
    line(x,y,x,277-i*3,'#233c2c',4);line(x,y,466-i*17,y,'#263f30',6);
  }
  for(let y=52;y<260;y+=24)line(28,y,462,y,'#172e22');
  const light=ctx.createRadialGradient(215,110,5,235,160,230);light.addColorStop(0,'rgba(106,142,105,.14)');light.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=light;ctx.fillRect(0,0,480,360);
  box(0,278,480,82,'#08160f');
  for(let i=0;i<9;i++)line(220+i*9,276,i*70-45,360,'#284131');
  line(0,319,480,319,'#1e3727');line(0,351,480,351,'#2e4935');
  // Existing mine opening, hanging cargo cage and the temporary hand-off rail.
  box(15,37,44,220,'#020906');box(12,35,6,241,metal);box(60,35,6,241,metal);
  for(let y=41;y<270;y+=24){line(15,y,65,y+20,'#314d38',2);box(17,y,4,4,edge);}
  line(27,24,27,194,edge,2);line(51,24,51,194,dim,2);
  box(21,24,41,7,metal);box(31,14,23,8,edge);
  const travel=s.shipment?1-s.shipment.left/s.shipment.duration:0;
  const cargoY=s.shipment?68+travel*166:215;
  line(40,34,40,cargoY,'#55775a');box(22,cargoY,35,7,edge);box(24,cargoY-24,30,24,s.shipment?'#465c42':shadow);
  if(!s.shipment||travel<.72){line(27,cargoY-22,50,cargoY-2,'#7c8d68',2);line(51,cargoY-22,27,cargoY-2,'#7c8d68');}
  box(20,268,49,8,metal);line(22,268,65,268,lit,2);
  // Distant gate, larger than the foreground installations. Its interior is a passage, not a reward icon.
  const opening=s.commissioned?(reduced?1:Math.min(1,(s.elapsed-(s.launchedAt??0))/16)):0;
  box(361,58,95,220,'#020a07');
  for(let j=4;j>=0;j--){line(365+j*6,62+j*9,452-j*6,62+j*9,'#203c2c',3);line(365+j*6,62+j*9,365+j*6,276-j*3,'#203c2c',3);}
  const gap=opening*28;
  box(367-gap,66,41,203,'#263e2d');box(411+gap,66,40,203,'#1c3526');
  for(let y=76;y<262;y+=21){line(370-gap,y,405-gap,y,edge,2);line(414+gap,y,447+gap,y,'#3a5941',2);}
  line(408-gap,65,408-gap,269,lit,2);line(411+gap,65,411+gap,269,edge,2);
  if(opening>.2){for(let i=0;i<4;i++)box(406+i*4,105+i*18,2,2,'#8f9e7d');}
  box(353,276,110,9,metal);line(353,276,463,276,edge,2);
  // The winch is a real tall gantry, assembled from footings through cable and motor.
  const w=progress('winch');
  if(w>0){
    box(75,282,102,9,metal);line(74,281,178,281,edge,2);
    if(w>.12){box(82,236-w*135,9,w*135+45,metal);box(159,236-w*135,8,w*135+45,metal);line(83,240-w*135,83,281,edge,2);}
    if(w>.35){box(78,100,94,13,metal);box(77,98,96,4,edge);line(86,115,158,176,edge,2);}
    if(w>.58){
      box(108,113,41,29,shadow);ctx.strokeStyle=edge;ctx.lineWidth=4;ctx.beginPath();ctx.arc(127,126,14,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<4;i++)line(112+i*6,116,112+i*6,136,'#547252');
      const hook=178+(s.shipment&&!reduced?Math.sin(travel*Math.PI)*36:0);line(126,141,126,hook,lit,2);
      line(126,hook,121,hook+9,edge,3);line(121,hook+9,129,hook+12,edge,3);
    }
    if(w>.85){box(93,249,59,13,'#435e43');box(94,247,59,3,lit);box(99,261,8,15,metal);box(139,261,8,15,metal);}
  }else{
    box(79,281,94,4,dim);for(let j=0;j<3;j++)box(89+j*23,276,15,5,'#354b34');
  }
  // Press: elevated hopper, cylinder, working platen, exposed flywheel, output chute.
  const p=progress('press');
  if(s.built.press){
    line(176,287,225,155,'#294c35',8);line(176,287,225,155,edge,2);line(188,287,237,155,edge,2);
    line(204,226,204,285,dim,3);
    if(active)for(let i=0;i<3;i++){const q=reduced?i/3:(phase*.12+i/3)%1;box(178+q*49,283-q*132,6,5,'#83906b');}
  }
  if(p>0){
    box(207,284,100,9,metal);line(205,284,308,284,edge,2);
    if(p>.15){box(214,212-p*39,10,76,metal);box(285,212-p*39,11,76,metal);line(217,186,217,281,edge,2);}
    if(p>.38){box(211,175,88,14,metal);box(211,174,88,3,edge);box(249,188,12,41,edge);}
    if(p>.6){
      const stroke=s.built.press&&active&&!reduced?(Math.sin(phase*1.6)+1)*7:7;
      box(232,224+stroke,46,7,'#6b8460');box(229,261,55,8,metal);line(231,260,285,260,lit,2);
      box(275,214,28,36,shadow);ctx.strokeStyle=edge;ctx.lineWidth=3;ctx.beginPath();ctx.arc(292,231,14,0,Math.PI*2);ctx.stroke();
      const rot=s.built.press&&active?phase:0;line(292,231,292+Math.cos(rot)*10,231+Math.sin(rot)*10,lit,2);
    }
    if(p>.83){
      box(224,145,48,8,edge);ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(226,153);ctx.lineTo(268,153);ctx.lineTo(258,174);ctx.lineTo(237,174);ctx.closePath();ctx.fill();
      box(226,145,46,Math.min(7,s.raw.toNumber()/4),'#728164');line(223,144,273,144,lit,2);
    }
  }else{box(212,283,89,4,dim);box(225,268,55,14,'#1f3427');line(226,268,278,268,'#3c5740');}
  // Connected frame extends the rails and makes the route to the next chamber visible.
  const f=progress('frame');
  if(f>0){
    for(const x of [338,454]){box(x,278-f*214,9,f*214,metal);line(x,278-f*214,x,278,edge,2);}
    if(f>.35){box(331,60,133,12,metal);line(332,60,465,60,lit,2);}
    if(f>.65){line(342,83,367,115,edge,5);line(455,83,431,115,edge,5);}
    if(f>.85){box(80,306,370,5,metal);line(82,305,449,305,edge,2);for(let x=91;x<449;x+=25)line(x,310,x-5,321,'#314d35',3);}
  }
  // Conveyor and visible material stream connect input, processing and installation.
  box(52,298,270,6,metal);line(53,297,322,297,edge,2);
  for(let x=59;x<323;x+=15){ctx.strokeStyle='#405f43';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,301,3,0,Math.PI*2);ctx.stroke();}
  if(active){for(let i=0;i<4;i++){
    const q=reduced?i/4:(phase*.08+i/4)%1,x=60+q*255;
    box(x,289,10,7,i%2?'#6d7f5b':'#4d6b4a');line(x,289,x+9,289,'#a4ad7a');
  }}
  const plates=Math.min(5,Math.ceil(s.raw.toNumber()/5));
  for(let i=0;i<plates;i++){box(177+(i%2)*12,284-i*3,21,3,i%2?'#536b4b':'#69805a');line(177+(i%2)*12,284-i*3,197+(i%2)*12,284-i*3,'#8b9c72');}
  if(s.shipment&&travel>.72){const x=47+(travel-.72)/.28*130;box(x,282,17,12,'#536a49');line(x,283,x+17,283,lit,2);}
  // Power bus is absent until physically installed. A commissioned system carries an impulse through it.
  const r=progress('relay');
  if(r>0){
    const length=340*r;line(80,77,80+length,77,edge,3);line(245,77,245,146,'#42654a',3);
    if(r>.35){box(230,88,44,38,metal);box(235,93,34,27,shadow);for(let i=0;i<3;i++)box(239+i*9,99,5,5,s.commissioned?'#a3bc8c':edge);}
    if(s.commissioned){const pulse=reduced?.7:(phase*.11)%1;box(80+pulse*340,75,8,4,'#b3c397');line(420,77,420,153,'#83a47b',2);}
  }
  // One installation trolley goes to the actual construction site.
  if(s.job){
    const dest=s.job.id==='winch'?115:s.job.id==='press'?255:365;
    const move=reduced?.6:(phase*.07)%1,x=180+(dest-180)*move;
    box(x-13,320,27,12,metal);line(x-12,320,x+12,320,amber,2);box(x-9,332,5,4,edge);box(x+8,332,5,4,edge);
    line(x,320,x+8,301,amber,2);
    if(!reduced){for(let i=0;i<3;i++)box(dest-3+Math.sin(phase*9+i)*6,280+Math.cos(phase*11+i)*5,2,2,amber);}
  }
  for(let i=0;i<Math.min(5,s.gallery);i++){line(353+i*7,76+i*7,353+i*7,269,edge,2);}
  if(selected){const [x,y,w,h]=REGIONS[selected];ctx.strokeStyle=amber;ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.strokeRect(x-4,y-4,w+8,h+8);ctx.setLineDash([]);}
  if(s.job&&s.job.id!=='gallery'){
    const [x,y,w,h]=REGIONS[s.job.id];ctx.strokeStyle='rgba(168,153,99,.45)';ctx.lineWidth=1;ctx.setLineDash([2,5]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);
  }
  // Small lamps illuminate machinery, leaving the surrounding structure dark.
  for(const [x,y] of [[76,48],[199,45],[324,48],[456,45]]){box(x-7,y,14,4,metal);box(x-5,y+4,10,2,'#9aa887');}
  const shade=ctx.createRadialGradient(230,180,110,230,180,300);shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.72)');ctx.fillStyle=shade;ctx.fillRect(0,0,480,360);
  box(0,345,480,15,'#04100a');ctx.font='9px monospace';ctx.fillStyle='#829c81';ctx.textAlign='left';ctx.fillText(s.commissioned?'СИСТЕМА ПОД НАГРУЗКОЙ':s.job?'МОНТАЖНЫЙ УЧАСТОК':'ПРИЁМНАЯ ГАЛЕРЕЯ',12,355);
  ctx.textAlign='right';ctx.fillText('ЗАЛ 01 / 05',468,355);
  ctx.restore();
}

export function labCamera(s:LabState,label='КАМ-10 / ПРИЁМНЫЙ ЗАЛ') {
  const root=document.createElement('div');root.className='lab-camera';
  const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Приёмный зал: грузовая лебёдка слева, пресс в центре, несущая рама и затвор справа');
  const caption=document.createElement('span');caption.className='lab-camera-label';caption.textContent=label;
  root.append(canvas,caption);
  return {root,canvas,draw:(state=s,reduced=false,selected:LabModule|null=null)=>{
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1);
    const width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    if(width&&height)drawLab(canvas.getContext('2d')!,state,width,height,reduced,selected);
  }};
}
