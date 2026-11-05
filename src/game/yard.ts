import { PRODUCERS } from './producers';
import { CASES, eventById, type StoryState } from './story';

/** The place remembers construction and recordings; this never grants production. */
export interface YardState {
  built: Record<string, number>;
  upgrades: string[];
  evidence: string[];
  wakeSeconds: number;
  batches: number;
  stage: number;
}
export const newYard = (): YardState => ({ built:{}, upgrades:[], evidence:[], wakeSeconds:0, batches:0, stage:0 });
const hardware = new Set(PRODUCERS.flatMap(p=>[1,2,3,4].map(i=>`${p.id}-${i}`)));

export function rememberYard(y:YardState,owned:Record<string,number>,upgrades:readonly string[],story:StoryState):void {
  for(const p of PRODUCERS){const n=owned[p.id];if(Number.isSafeInteger(n)&&n>0)y.built[p.id]=Math.max(y.built[p.id]??0,n);}
  for(const id of upgrades)if(hardware.has(id)&&!y.upgrades.includes(id)){
    y.upgrades.push(id);const producer=id.slice(0,id.lastIndexOf('-'));y.built[producer]=Math.max(y.built[producer]??0,1);
  }
  const events=[...story.cases,...story.records.map(r=>r.event)];
  for(const trace of story.traces){const e=CASES.find(e=>e.trace===trace);if(e)events.push(e.id);}
  for(const id of events){const e=eventById(id);if(e?.caseNo&&!e.plant){if(!y.evidence.includes(id))y.evidence.push(id);if(e.needs)y.built[e.needs]=Math.max(y.built[e.needs]??0,1);}}
}

/** Slow narrative tension is separate from the danger the floodlight controls. */
export function yardStage(y:YardState):number {
  const time=[12*60,40*60,100*60,4*3600].filter(at=>y.wakeSeconds>=at).length;
  const gate=y.built.landfill?4:y.built.plant?3:y.built.sorter?2:y.built.cart||y.built.truck?1:0;
  return Math.max(y.stage,Math.min(time,gate));
}
export function loadYard(raw:unknown):YardState|null {
  if(!raw||typeof raw!=='object')return null;
  const r=raw as Partial<YardState>,y=newYard();
  if(!r.built||typeof r.built!=='object'||!Array.isArray(r.upgrades)||!Array.isArray(r.evidence)||!Number.isFinite(r.wakeSeconds)||r.wakeSeconds!<0||!Number.isSafeInteger(r.batches)||r.batches!<0||!Number.isInteger(r.stage)||r.stage!<0||r.stage!>4)return null;
  for(const p of PRODUCERS){const n=r.built[p.id];if(n!==undefined){if(!Number.isSafeInteger(n)||n<0)return null;if(n)y.built[p.id]=n;}}
  y.upgrades=[...new Set(r.upgrades.filter(id=>typeof id==='string'&&hardware.has(id)))];
  y.evidence=[...new Set(r.evidence.filter(id=>typeof id==='string'&&!!eventById(id)?.caseNo&&!eventById(id)?.plant))];
  y.wakeSeconds=Math.min(r.wakeSeconds!,4*3600);y.batches=r.batches!;y.stage=r.stage!;return y;
}
