import { describe, expect, it } from 'vitest';
import { workshopInventory, workshopAnomalies, workshopScenery } from '../src/ui/workshopCam';
import { UPGRADES } from '../src/game/upgrades';

describe('workshop equipment inventory', () => {
  it('shows exact purchased tiers even when bought out of order', () => {
    const tiers = UPGRADES.filter(u => u.effect.kind === 'producer' && u.effect.target === 'collector');
    const inventory = workshopInventory([tiers[2].id]);
    expect(inventory.kits[0].slots.map(s => s.bought)).toEqual([false, false, true, false]);
    expect(inventory.kits.slice(1).every(k => k.slots.every(s => !s.bought))).toBe(true);
  });
  it('accounts for the full catalogue without losing global or synergy upgrades', () => {
    const full = workshopInventory(UPGRADES.map(u => u.id));
    expect(full.bought).toBe(UPGRADES.length);
    expect(full.kits.flatMap(k => k.slots).filter(s => s.bought).length + full.global.bought + full.synergy.bought).toBe(UPGRADES.length);
    const reset = workshopInventory([]);
    expect(reset.bought).toBe(0);
    expect(reset.kits.flatMap(k => k.slots).some(s => s.bought)).toBe(false);
  });
  it('does not count duplicate or unknown ids as installed equipment', () => {
    expect(workshopInventory([UPGRADES[0].id, UPGRADES[0].id, 'unknown']).bought).toBe(1);
  });
});


describe('workshop horror gates', () => {
  const view = { upgrades: [], compact: 1, bulk: 1, dark: 1, threat: 0.2 };
  it('keeps a quiet workshop free of threat events', () => {
    expect(workshopAnomalies(view)).toEqual([]);
  });
  it('limits anomalies to installed stations', () => {
    expect(workshopAnomalies({ ...view, threat: 0.8, compact: 0, bulk: 0 })).toEqual(['contract']);
    expect(workshopAnomalies({ ...view, threat: 0.8, compact: 0, bulk: 0, dark: 0 })).toEqual([]);
    expect(workshopAnomalies({ ...view, threat: 0.8 })).toEqual(['press', 'stock', 'contract']);
  });
});


describe('automatic-cycle workshop scenery', () => {
  it('holds installed equipment through an automatic reset, without changing actual upgrades', () => {
    const owner = {};
    const full = { owner, steady: true, upgrades: UPGRADES.map(u => u.id), compact: 20, bulk: 12, dark: 8, threat: 0 };
    const reset = { ...full, upgrades: [], compact: 0, bulk: 0, dark: 0 };
    const shown = workshopScenery(full, reset);
    expect(shown.upgrades).toEqual(full.upgrades);
    expect(shown.compact).toBe(20);
    expect(reset.upgrades).toEqual([]);
    expect(reset.compact).toBe(0);
    expect(workshopScenery(shown, { ...reset, steady: false }).upgrades).toEqual([]);
    expect(workshopScenery(shown, { ...reset, owner: {} }).upgrades).toEqual([]);
  });
});
