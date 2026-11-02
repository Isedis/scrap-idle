import { describe, expect, it } from 'vitest';
import {
  AUTO_OPEN,
  ABOVE_SCRIPTS,
  autoOpen,
  autoOpens,
  buyAboveScript,
  savingGoal,
  savingGoals,
  EQUIPMENT,
  buyEquipment,
  buyBorer,
  CONTAINERS,
  EPOCHS,
  RARITIES,
  RARITY_NAMES,
  START_HEAP,
  TOOLS,
  buyAuto,
  buyTool,
  canOpen,
  epochDone,
  fallPerMinute,
  melt,
  meltCost,
  newBottom,
  openOne,
  bottomTick,
  digRate,
  toolCost,
  type BottomState,
  type Rarity,
} from '../src/game/bottom';
import { D } from '../src/game/num';

/**
 * The bottom of the pit played by a simple attentive player, minute by minute: open
 * everything that can be opened, buy what is affordable, melt the surplus. The world
 * above is a curve of how many digits of trash it has collected since the descent, read
 * from the pacing bot (first recycle ~25 min at 12 digits, the line at 26, the town at 40),
 * sped up by the scripts bought here. Run with BOTTOM_SIM=1.
 */

/** Hours since the descent → digits of trash above, for a player with no help from below. */
const ABOVE: [number, number][] = [
  [0, 0],
  [0.4, 12],
  [1.3, 26],
  [2.3, 40],
  [5, 90],
  [10, 180],
  [20, 300],
];
const digitsAt = (h: number) => {
  for (let i = 1; i < ABOVE.length; i++) {
    const [h0, d0] = ABOVE[i - 1];
    const [h1, d1] = ABOVE[i];
    if (h <= h1) return d0 + ((d1 - d0) * (h - h0)) / (h1 - h0);
  }
  return ABOVE[ABOVE.length - 1][1];
};

/** Scripts of the world above, bought with currencies from below, in the order a player would. */
const SCRIPTS: [string, number, Rarity][] = ABOVE_SCRIPTS.map((sc) => [sc.id, sc.cost, sc.costIn]);

export function simulateBottom(hours: number, log: (h: number, what: string) => void, seed = 12345) {
  const b: BottomState = newBottom();
  b.open = true;
  b.heap = START_HEAP;
  let rand = seed;
  const rng = () => (rand = (rand * 16807) % 2147483647) / 2147483647;
  let scripts = 0;
  // Time above runs faster with every script bought from below.
  let aboveHours = 0;
  const seen = new Set<string>();
  const firstRarity = new Set<Rarity>();
  for (let m = 0; m < hours * 60; m++) {
    const h = m / 60;
    aboveHours += (1 + 0.12 * scripts) / 60;
    const digits = digitsAt(aboveHours);
    if (!savingGoal(b)) {
      const offers = savingGoals(b);
      const tool = TOOLS.filter(t => b.tools[t.id] < t.max).sort((a, c) => b.tools[a.id] - b.tools[c.id])[0];
      const target = offers.find(g => g.id === 'auto')
        ?? offers.find(g => g.id === `script:${SCRIPTS[scripts]?.[0]}`)
        ?? offers.find(g => g.id.startsWith('equipment:') && g.unlocked)
        ?? offers.find(g => g.id === 'borer' && g.unlocked && b.ume.gte(g.cost))
        ?? offers.find(g => g.id === `tool:${tool?.id}`);
      b.saving = target?.id ?? null;
    }
    b.above = D(10).pow(digits);
    bottomTick(b, 60, fallPerMinute(b.above), rng);
    // Match advance(): automatic fees happen BEFORE the player's purchases.
    autoOpen(b, rng);
    const canSpend = (id: string, currency: Rarity, cost: number) => {
      const goal = savingGoal(b);
      return !goal || goal.id === id || goal.costIn !== currency || b.money[currency].sub(cost).gte(goal.cost);
    };
    // Purchases: automatic opening, then scripts, then the cheapest tool level.
    if (AUTO_OPEN[b.auto] && canSpend('auto', AUTO_OPEN[b.auto].costIn, AUTO_OPEN[b.auto].cost) && buyAuto(b)) log(h, `автовскрытие ${b.auto}: ${AUTO_OPEN[b.auto - 1].name}`);
    while (scripts < SCRIPTS.length) {
      const [name, cost, cur] = SCRIPTS[scripts];
      if (!canSpend(`script:${name}`, cur, cost) || !buyAboveScript(b, name)) break;
      scripts++;
      log(h, `скрипт наверху: ${name}`);
    }
    for (let guard = 0; guard < 50; guard++) {
      const t = TOOLS.filter((x) => b.tools[x.id] < x.max).find((x) => b.money[x.costIn].gte(toolCost(x, b.tools[x.id])) && canSpend(`tool:${x.id}`, x.costIn, toolCost(x, b.tools[x.id]).toNumber()));
      if (!t || !buyTool(b, t.id)) break;
      if (b.tools[t.id] === 1 || b.tools[t.id] % 5 === 0) log(h, `${t.name} ур. ${b.tools[t.id]}`);
    }
    for (const e of EQUIPMENT) if (canSpend(`equipment:${e.id}`, e.costIn, e.cost) && buyEquipment(b, e.id)) log(h, `оборудование: ${e.name}`);
    if (buyBorer(b)) log(h, `проходчик: ${b.equipment.borer}`);
    // Then opens everything the money still allows.
    for (const c of CONTAINERS.filter(c => !autoOpens(b).includes(c.id))) {
      while (canOpen(b, c.id) && canSpend(`open:${c.id}`, c.costIn, c.cost)) {
        const r = openOne(b, c.id, rng)!;
        if (r.fresh) seen.add(r.item.id);
        if (!firstRarity.has(r.item.rarity)) {
          firstRarity.add(r.item.rarity);
          log(h, `первая находка «${RARITY_NAMES[r.item.rarity]}»: ${r.item.name} (из «${c.name}»)`);
        }
      }
    }
    for (const e of EPOCHS) if (epochDone(b, e.id) && !seen.has(`set:${e.id}`)) {
      seen.add(`set:${e.id}`);
      log(h, `НАБОР «${e.name}»: ${e.bonus}`);
    }
    // Melt the surplus upward, keeping enough for the next purchase in each currency.
    for (const r of RARITIES) {
      const need = [
        ...EQUIPMENT.filter((e) => e.costIn === r && !b.equipment[e.id]).map((e) => e.cost),
        ...TOOLS.filter((x) => x.costIn === r && b.tools[x.id] < x.max).map((x) => toolCost(x, b.tools[x.id]).toNumber()),
        ...CONTAINERS.filter((c) => c.costIn === r && c.cost > 0).map((c) => c.cost * 5),
        ...(AUTO_OPEN[b.auto]?.costIn === r ? [AUTO_OPEN[b.auto].cost] : []),
        ...(SCRIPTS[scripts]?.[2] === r ? [SCRIPTS[scripts][1]] : []),
      ];
      const goal = savingGoal(b);
      const keep = Math.max(0, ...need, goal?.costIn === r ? goal.cost.toNumber() : 0);
      const spare = Math.floor(b.money[r].toNumber() - keep);
      if (spare > 0) {
        const before = b.ume.toNumber();
        melt(b, r, Math.floor(spare / meltCost(b, r)));
        if (b.ume.toNumber() > before) log(h, `УМЕ: ${b.ume.toString()}`);
      }
    }
    if (m % 60 === 59) {
      log(h, `час ${Math.round(h)}: гора ${Math.round(b.heap)} т, копает ${digRate(b).toFixed(1)} т/мин, сверху ${fallPerMinute(D(10).pow(digits)).toFixed(1)} т/мин, вскрыто ${b.opened}, коллекция ${Object.keys(b.found).length}/40, вглубь ${Math.round(b.dug)} т, автовскрытие ${b.auto}, УМЕ ${b.ume.toString()}, ` +
        RARITIES.map((r) => `${RARITY_NAMES[r]} ${b.money[r].floor().toString()}`).join(' · '));
    }
  }
  return b;
}

describe.runIf(process.env.BOTTOM_SIM)('the bottom, played', () => {
  it('reaches the first УМЕ in 10 to 15 modelled hours with automatic fees before purchases', () => {
    let first = Infinity;
    const hours = Number(process.env.BOTTOM_HOURS ?? 16);
    simulateBottom(hours, (h, what) => {
      console.log(`${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} ${what}`);
      if (what.startsWith('УМЕ') && first === Infinity) first = h;
    });
    expect(first).toBeGreaterThan(10);
    expect(first).toBeLessThan(15);
  });

  it('keeps early metal upgrades reachable across different find sequences with real automatic spending', () => {
    for (const seed of [1, 7, 42, 98765]) {
      let first = Infinity, lamp = Infinity, luck = Infinity;
      simulateBottom(20, (h, what) => {
        if (what.startsWith('УМЕ') && first === Infinity) first = h;
        if (what.startsWith('Фонарь ур. 1') && lamp === Infinity) lamp = h;
        if (what.startsWith('Чутьё ур. 1') && luck === Infinity) luck = h;
      }, seed);
      console.log(`seed ${seed}: lamp ${lamp.toFixed(2)}h, luck ${luck.toFixed(2)}h, UME ${first.toFixed(2)}h`);
      expect(lamp, `lamp seed ${seed}`).toBeLessThanOrEqual(0.25);
      expect(luck, `luck seed ${seed}`).toBeLessThanOrEqual(0.25);
      expect(first, `UME seed ${seed}`).toBeLessThan(20);
    }
  });

});
