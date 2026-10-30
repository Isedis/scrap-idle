import { describe, expect, it } from 'vitest';
import { advance, loseShift, newGame, producerRate, recordAway, storyTick } from '../src/game/state';
import { BOOST_MULT, CASES, CASE_BONUS, EVENTS, NOTES, PHRASES, eventInterval, newStory, pickEvent, record, watch } from '../src/game/story';
import { THREAT_STARTS_AT } from '../src/game/threat';
import { deserialize, serialize } from '../src/game/save';

const day = new Date(2026, 9, 30, 14, 0);

describe('events', () => {
  it('have unique ids and case numbers 1..N', () => {
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    expect(CASES.map((c) => c.caseNo)).toEqual(CASES.map((_, i) => i + 1));
  });

  it('nothing happens before the threat wakes', () => {
    const s = newGame(0);
    expect(storyTick(s, 1e6, day)).toBeNull();
  });

  it('first comes the earliest uncaught story event of the stage', () => {
    const story = newStory();
    expect(pickEvent(story, 1, {}).id).toBe('eyes');
    record(story, pickEvent(story, 1, {}), 0);
    expect(pickEvent(story, 1, {}).id).toBe('bag');
  });

  it('skips events that need a producer the player lacks', () => {
    const story = newStory();
    for (const id of ['eyes', 'bag', 'lamp-blink', 'extra', 'fridge', 'cam00', 'note']) record(story, EVENTS.find((e) => e.id === id)!, 0);
    expect(pickEvent(story, 3, { collector: 1 }).id).toBe('typing');
    expect(pickEvent(story, 3, { collector: 1, truck: 1 }).id).toBe('driverless');
  });

  it('comes twice as often at night and more often under pressure', () => {
    const mid = () => 0.5;
    expect(eventInterval(1, true, mid)).toBe(eventInterval(1, false, mid) / 2);
    expect(eventInterval(4, false, mid)).toBeLessThan(eventInterval(1, false, mid));
  });

  it('fires on schedule once the threat is up', () => {
    const s = newGame(0);
    s.runTrash = THREAT_STARTS_AT;
    s.threat.level = 0.3;
    s.story.nextIn = 5;
    expect(storyTick(s, 3, day)).toBeNull();
    const rec = storyTick(s, 3, day)!;
    expect(rec.event).toBe('eyes');
    expect(s.story.records[0]).toBe(rec);
    expect(s.story.nextIn).toBeGreaterThan(0);
  });
});

describe('archive', () => {
  it('watching opens the case once and adds the bonus', () => {
    const s = newGame(0);
    const rate = producerRate(s, 'collector').toNumber();
    const rec = record(s.story, EVENTS[0], 1);
    const first = watch(s.story, rec.seq);
    expect(first.opened?.id).toBe('eyes');
    expect(watch(s.story, rec.seq)).toEqual({});
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(rate * (1 + CASE_BONUS));
  });

  it('notes come in order; phrases are fixed when recorded', () => {
    const story = newStory();
    const note = EVENTS.find((e) => e.kind === 'note')!;
    const a = record(story, note, 1);
    const b = record(story, note, 2);
    expect(watch(story, a.seq).note).toBe(NOTES[0]);
    expect(watch(story, b.seq).note).toBe(NOTES[1]);
    const voice = record(story, EVENTS.find((e) => e.kind === 'voice')!, 3, { rand: () => 0 });
    expect(voice.phrase).toBe(PHRASES[0]);
    expect(watch(story, voice.seq).phrase).toBe(PHRASES[0]);
    expect(story.voices).toEqual([PHRASES[0]]);
  });

  it('ambient events give a short boost', () => {
    const s = newGame(0);
    const rate = producerRate(s, 'collector').toNumber();
    const rec = record(s.story, EVENTS.find((e) => e.id === 'gull')!, 1);
    expect(watch(s.story, rec.seq).boosted).toBe(true);
    expect(producerRate(s, 'collector').toNumber()).toBeCloseTo(rate * BOOST_MULT);
    advance(s, 31);
    expect(s.story.boost).toBe(0);
  });

  it('traces stay until the run ends', () => {
    const s = newGame(0);
    record(s.story, EVENTS.find((e) => e.id === 'fridge')!, 1);
    expect(s.story.traces).toEqual(['fridge']);
    loseShift(s);
    expect(s.story.traces).toEqual([]);
  });

  it('keeps the last 20 recordings', () => {
    const story = newStory();
    for (let i = 0; i < 30; i++) record(story, EVENTS[0], i);
    expect(story.records).toHaveLength(20);
    expect(story.records[0].seq).toBe(30);
  });

  it('records from a long absence', () => {
    const s = newGame(0);
    s.runTrash = THREAT_STARTS_AT;
    expect(recordAway(s, 60, 1e9)).toHaveLength(0);
    const recs = recordAway(s, 3 * 3600, 1e9);
    expect(recs).toHaveLength(2);
    expect(recs.every((r) => r.away && r.at <= 1e9)).toBe(true);
  });

  it('survives a save', () => {
    const s = newGame(0);
    const rec = record(s.story, EVENTS[0], 5);
    watch(s.story, rec.seq);
    record(s.story, EVENTS.find((e) => e.id === 'lamp-turn')!, 6);
    const back = deserialize(serialize(s))!;
    expect(back.story.cases).toEqual(['eyes']);
    expect(back.story.records.map((r) => r.event)).toEqual(['lamp-turn', 'eyes']);
    expect(back.story.traces).toEqual(['lamp']);
    expect(back.story.seq).toBe(2);
  });
});
