import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame } from '../src/game/state';
import { D } from '../src/game/num';
import { SAVE_KEY, BACKUP_KEY, MIGRATION_KEY, OWNER_KEY, claimSave, ownerChanged, isDisplaced, serialize, readSave, writeSave, getSaveHealth, allowSaveReplacement, migrationCheckpoint, importSave, wipeSave } from '../src/game/save';

describe('save storage and recovery', () => {
  let data: Map<string,string>;
  let failWrites: boolean;
  beforeEach(() => {
    data=new Map();failWrites=false;allowSaveReplacement();
    vi.stubGlobal('window',{localStorage:{
      getItem:(key:string)=>data.get(key)??null,
      setItem:(key:string,value:string)=>{if(failWrites)throw new Error('quota');data.set(key,value);},
      removeItem:(key:string)=>data.delete(key),
    }});
  });
  afterEach(()=>vi.unstubAllGlobals());
  it('reports failed writes without claiming success; a later successful retry clears the error',()=>{
    const s=newGame(0),old=serialize(s);data.set(SAVE_KEY,old);readSave();failWrites=true;
    s.trash=D(123);expect(writeSave(s)).toBe(false);expect(getSaveHealth().error).toContain('Не удалось сохранить');
    expect(data.get(SAVE_KEY)).toBe(old);
    // Export remains possible even with unavailable storage.
    expect(importSave(serialize(s))!.trash.eq(123)).toBe(true);
    failWrites=false;expect(writeSave(s)).toBe(true);expect(getSaveHealth().error).toBeNull();
    expect(getSaveHealth().lastSaved).toBeTypeOf('number');
  });
  it('preserves unmigrated city data independently of rotating backups',()=>{
    const old=JSON.parse(serialize(newGame(0)));old.v=22;old.layers.city.development=3;
    const raw=JSON.stringify(old);data.set(SAVE_KEY,raw);
    const loaded=readSave()!;expect(loaded.city.development).toBeGreaterThanOrEqual(3);
    expect(data.get(MIGRATION_KEY)).toBe(raw);
    expect(writeSave(loaded)).toBe(true);loaded.trash=D(321);writeSave(loaded);
    expect(migrationCheckpoint()).toBe(raw);expect(data.get(BACKUP_KEY)).not.toBe(raw);
  });
  it('keeps the old main save if its migration checkpoint cannot be written',()=>{
    const old=JSON.parse(serialize(newGame(0)));old.v=22;const raw=JSON.stringify(old);
    data.set(SAVE_KEY,raw);failWrites=true;const s=readSave()!;
    expect(getSaveHealth().error).toContain('копию');expect(writeSave(s)).toBe(false);
    expect(data.get(SAVE_KEY)).toBe(raw);
    failWrites=false;expect(writeSave(s)).toBe(true);expect(data.get(MIGRATION_KEY)).toBe(raw);
  });
  it('recovers the backup without replacing it with the damaged main save',()=>{
    const good=serialize(newGame(0));data.set(SAVE_KEY,'broken');data.set(BACKUP_KEY,good);
    const s=readSave()!;expect(s).not.toBeNull();expect(getSaveHealth().recovered).toBe(true);
    s.trash=D(42);writeSave(s);expect(data.get(BACKUP_KEY)).toBe(good);
    expect(importSave(data.get(SAVE_KEY)!)!.trash.eq(42)).toBe(true);
  });
  it('does not overwrite unreadable saves with an automatic new game',()=>{
    data.set(SAVE_KEY,'damaged main');data.set(BACKUP_KEY,'damaged backup');
    expect(readSave()).toBeNull();expect(writeSave(newGame(0))).toBe(false);
    expect(data.get(SAVE_KEY)).toBe('damaged main');expect(data.get(BACKUP_KEY)).toBe('damaged backup');
    allowSaveReplacement();expect(writeSave(newGame(0))).toBe(true);
  });
  it('reports inaccessible storage and wipes the migration copy only on explicit reset',()=>{
    data.set(MIGRATION_KEY,'old');wipeSave();expect(migrationCheckpoint()).toBeNull();
    vi.stubGlobal('window',{get localStorage(){throw new Error('blocked');}});
    expect(writeSave(newGame(0))).toBe(false);expect(getSaveHealth().error).toContain('недоступно');
  });
  // Runs last: once displaced, this module's copy of the game stays stopped.
  it('stops writing once another open copy of the game claims the save',()=>{
    let lost=0;claimSave(()=>lost++);
    const s=newGame(0);s.trash=D(5);expect(writeSave(s)).toBe(true);
    // Another tab took over and the storage event was missed (a suspended phone tab).
    data.set(OWNER_KEY,'other');s.trash=D(9);
    expect(writeSave(s)).toBe(false);expect(lost).toBe(1);expect(isDisplaced()).toBe(true);
    expect(importSave(data.get(SAVE_KEY)!)!.trash.eq(5)).toBe(true);
    ownerChanged(OWNER_KEY,'third');expect(lost).toBe(1);
  });
});
