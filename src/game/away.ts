import { offlineActivity, type OfflineActivity } from './offline';
import { Decimal } from './num';
import { gateReady, HALLS } from './horizon';
import { FRACS, type Inspection } from './sorting';
import { offlineRate, ratePerSecond, type GameState } from './state';

/**
 * What changed while the game was closed, for the screen the player comes back to:
 * a snapshot before the offline time runs, compared with the state after it.
 */

export interface AwaySnapshot {
  trash: Decimal;
  totalTrash: Decimal;
  threat: number;
  fractions: Decimal;
  news: number;
  horizon: { total: Decimal; opened: number; work: number };
  bottom: { firstUme: boolean; work: { hoist: number; bench: number; borer: number }; seamFound: number };
}

export interface AwayReport {
  seconds: number;
  /** Share of income earned while closed. */
  efficiency: number;
  trash: Decimal;
  /** Threat level on return, and whether it rose. */
  threat: number;
  threatRose: boolean;
  /** Camera recordings made while away. */
  recordings: number;
  fractions: Decimal;
  /** Unique finds and bales from the inspection table. */
  finds: string[];
  bales: number;
  automation: OfflineActivity;
  balance: { trash: Decimal; recycled: Decimal; fractions: Decimal };
  income: Decimal;
  hearing: 'idle' | 'walk' | 'check' | 'caught';
  horizon: { gained: Decimal; note: string; attention: { text: string; action: 'ume' | 'assembly' | 'gate'; label: string } | null };
  bottom: { firstUme: boolean; site: string; seamFound: number };
}

const sumFractions = (s: GameState) => s.sorting.total;

/** A single actionable explanation of the current manual stop, not an extra ledger. */
function horizonAttention(s: GameState): AwayReport['horizon']['attention'] {
  const h=s.horizon;
  if(!h.open||h.opened>=HALLS.length)return null;
  if(gateReady(h))return s.bottom.ume.lt(1)
    ? {text:'Затвор собран, но ждёт 1 УМЕ из шахты.',action:'ume',label:'ЗА УМЕ В ШАХТУ →'}
    : {text:'Монтаж завершён. Затвор ждёт ручного открытия.',action:'gate',label:'К ЗАТВОРУ →'};
  if(!h.autoBuild)return {text:'Монтаж выключен. КМ продолжают копиться.',action:'assembly',label:'К НАСТРОЙКАМ МОНТАЖА →'};
  if(h.mode==='growth')return {text:'Монтаж на паузе: режим «Рост» копит КМ без сборки.',action:'assembly',label:'К РЕЖИМАМ МОНТАЖА →'};
  return null;
}

export function awaySnapshot(s: GameState): AwaySnapshot {
  return { trash: s.trash, totalTrash: s.totalTrash, threat: s.threat.level, fractions: sumFractions(s), news: s.sorting.news.length,
    horizon: { total: s.horizon.total, opened: s.horizon.opened, work: s.horizon.work.reduce((sum,w)=>sum+w.toNumber(),0) },
    bottom: { firstUme: s.bottom.firstUmeGranted, work: { ...s.bottom.objectWork }, seamFound: s.bottom.seamFound } };
}

export function awayReport(before: AwaySnapshot, s: GameState, seconds: number): AwayReport {
  const news: Inspection[] = s.sorting.news.slice(before.news);
  const site = (['hoist', 'bench', 'borer'] as const).find((id) => s.bottom.objectWork[id] > before.bottom.work[id] + 1e-6);
  const siteName = { hoist: 'Подъёмник', bench: 'Разборочный стол', borer: 'Проходчик' };
  return {
    seconds,
    automation: offlineActivity(s),
    balance: { trash: s.trash, recycled: s.recycle.points, fractions: FRACS.reduce((sum, f) => sum.add(s.sorting.fractions[f]), new Decimal(0)) },
    income: ratePerSecond(s),
    hearing: s.hearing.phase,
    horizon: { gained: s.horizon.total.sub(before.horizon.total).max(0), note: s.horizon.open && s.horizon.opened < 5 ? gateReady(s.horizon) ? 'Горизонт: затвор готов к открытию' : s.horizon.work.reduce((sum,w)=>sum+w.toNumber(),0) > before.horizon.work ? 'Продолжался монтаж: '+HALLS[s.horizon.opened].name : '' : '', attention: horizonAttention(s) },
    bottom: { firstUme: !before.bottom.firstUme && s.bottom.firstUmeGranted,
      site: site ? `${siteName[site]}: ${Math.floor(s.bottom.objectWork[site])} / ${site === 'hoist' ? 120 : site === 'bench' ? 300 : 600} т${s.bottom.objectWork[site] >= (site === 'hoist' ? 120 : site === 'bench' ? 300 : 600) ? ' · можно запустить' : ''}` : '',
      seamFound: Math.max(0, s.bottom.seamFound - before.bottom.seamFound) },
    efficiency: offlineRate(s),
    trash: s.totalTrash.sub(before.totalTrash).max(0),
    threat: s.threat.level,
    threatRose: s.threat.level > before.threat + 0.001,
    // The archive keeps at most twenty, so count what is new by the away mark instead of the length.
    recordings: s.story.records.filter((r) => r.away && !r.watched).length,
    fractions: sumFractions(s).sub(before.fractions).max(0),
    finds: news.flatMap((n) => (n.kind === 'unique' ? [n.id] : [])),
    bales: news.filter((n) => n.kind === 'fractions').length,
  };
}

/** Long enough away to deserve the screen rather than a notice. */
export const AWAY_SCREEN_SECONDS = 5 * 60;
