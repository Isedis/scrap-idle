import { PLANT_KINDS, type EventDef, type Recording } from '../game/story';
import { Scene, type SceneView } from './scene';
import { PlantCam, type PlantView } from './plantCam';
import { el } from './dom';

const TYPE_MS_PER_CHAR = 70;
const CAM00_SECONDS = 1.6;
/** Seconds of a scene event, for the kinds the scene plays. */
const SCENE_SECONDS: Record<string, number> = {
  lampTurn: 2.5, lampBlink: 3, eyes: 4.5, fridge: 5, gull: 5, bag: 6, note: 6, raccoon: 7, extra: 7, cat: 7, breathe: 8, driverless: 9,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The review desk at the top of the journal: recordings play here, on a copy of the
 * camera that caught them, without leaving the journal. Idle, it shows camera 01 live.
 */
export class JournalMonitor {
  readonly root: HTMLElement;
  private yard: HTMLElement;
  private scene: Scene;
  private label: HTMLElement;
  private mark: HTMLElement;
  private terminal: HTMLElement;
  private paper: HTMLElement;
  private idle: HTMLElement;
  private plant = new PlantCam();
  private typing = 0;
  /** Which camera is on the desk. */
  private cam: 'yard' | 'plant' = 'yard';
  private playing = false;

  constructor() {
    this.root = el('div', 'j-monitor');
    this.yard = el('div', 'feed');
    const canvas = el('canvas', 'feed-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    this.label = el('div', 'feed-label', 'КАМ-01 · СВАЛКА');
    this.mark = el('div', 'feed-playback');
    this.mark.hidden = true;
    this.terminal = el('div', 'j-monitor-terminal');
    this.terminal.hidden = true;
    this.idle = el('div', 'j-monitor-idle', 'АРХИВ · выберите запись');
    this.yard.append(canvas, this.label, el('div', 'feed-rec', 'LIVE'), this.mark, this.terminal, this.idle);
    this.scene = new Scene(canvas);
    this.plant.root.hidden = true;
    this.paper = el('div', 'feed-paper');
    this.paper.hidden = true;
    this.paper.addEventListener('click', () => (this.paper.hidden = true));
    this.root.append(this.yard, this.plant.root, this.paper);
  }

  get busy(): boolean {
    return this.playing;
  }

  /** Plays a recording; returns how long it lasts, in seconds. */
  play(rec: Recording, event: EventDef): number {
    const d = new Date(rec.at);
    const mark = `◀◀ ЗАПИСЬ ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    this.playing = true;
    this.paper.hidden = true;
    this.idle.hidden = true;
    // The desk is the first thing in the journal: up to it, clear of the sticky header.
    window.scrollTo({ top: 0, behavior: 'smooth' });
    let seconds: number;
    if (PLANT_KINDS.includes(event.kind)) {
      this.setCam('plant');
      seconds = this.plant.playEvent(event.kind, mark);
    } else {
      this.setCam('yard');
      this.mark.textContent = mark;
      this.mark.hidden = false;
      this.scene.glitch(0.4);
      seconds = this.playYard(event, rec.phrase);
    }
    window.setTimeout(() => this.stop(), seconds * 1000 + 300);
    return seconds;
  }

  private playYard(event: EventDef, phrase: string | undefined): number {
    if (event.kind === 'cam00') {
      this.label.textContent = 'КАМ-00 · ЯМА';
      this.label.classList.add('cam00');
      this.scene.glitch(0.3);
      window.setTimeout(() => {
        this.label.textContent = 'КАМ-01 · СВАЛКА';
        this.label.classList.remove('cam00');
      }, CAM00_SECONDS * 1000);
      return CAM00_SECONDS;
    }
    if (event.kind === 'typing' || event.kind === 'voice') {
      // The terminal's line, typed over the picture.
      const text = phrase ?? '';
      clearInterval(this.typing);
      this.terminal.hidden = false;
      this.terminal.textContent = '> ';
      let i = 0;
      this.typing = window.setInterval(() => {
        this.terminal.textContent = `> ${text.slice(0, ++i)}`;
        if (i >= text.length) clearInterval(this.typing);
      }, TYPE_MS_PER_CHAR);
      if (event.kind === 'voice') this.scene.glitch(0.6);
      return (text.length * TYPE_MS_PER_CHAR) / 1000 + 1.5;
    }
    this.scene.playEvent(event.kind, true);
    return SCENE_SECONDS[event.kind] ?? 5;
  }

  private stop(): void {
    this.playing = false;
    this.mark.hidden = true;
    this.terminal.hidden = true;
    this.idle.hidden = false;
    this.setCam('yard');
  }

  private setCam(cam: 'yard' | 'plant'): void {
    this.cam = cam;
    this.yard.hidden = cam !== 'yard';
    this.plant.root.hidden = cam !== 'plant';
  }

  /** Ignatyev's note found in a recording, over the picture. */
  showNote(text: string): void {
    this.paper.textContent = text;
    this.paper.hidden = false;
    window.setTimeout(() => (this.paper.hidden = true), 9000);
  }

  /** Every frame while the journal is on screen. */
  frame(dt: number, yard: SceneView, plant: PlantView): void {
    if (this.cam === 'yard') this.scene.update(dt, yard);
    else this.plant.update(dt, plant);
  }
}
