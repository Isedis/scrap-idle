import type { AwayReport } from '../game/away';
import { el } from './dom';

/** One finite, decorative replay of real offline activity. No timers or game mutations. */
export function awayVignette(report: AwayReport): HTMLElement {
  const scene = el('div', 'away-scene');
  scene.setAttribute('aria-hidden', 'true');
  scene.classList.toggle('processed', report.automation.recycles > 0 || report.automation.resorts > 0);
  scene.classList.toggle('has-find', report.finds.length > 0);
  scene.classList.toggle('uneasy', report.threat >= 0.7);
  scene.classList.toggle('still', report.trash.lte(0) && !report.automation.recycles && !report.automation.resorts);
  // Static authored SVG; all report values are represented through classes above.
  scene.innerHTML = `<svg viewBox="0 0 320 94" xmlns="http://www.w3.org/2000/svg" fill="none">
    <defs>
      <linearGradient id="away-room" x2="0" y2="1"><stop stop-color="#0d2117"/><stop offset="1" stop-color="#06110b"/></linearGradient>
      <linearGradient id="away-metal" x2="0" y2="1"><stop stop-color="#58846a"/><stop offset="1" stop-color="#1a3626"/></linearGradient>
      <pattern id="away-tread" width="16" height="5" patternUnits="userSpaceOnUse"><path d="M1 4 5 1h8" stroke="#345840" stroke-width="1"/></pattern>
    </defs>
    <path fill="url(#away-room)" d="M0 0h320v94H0z"/>
    <g stroke="#183925" stroke-width="1"><path d="M0 24h320M0 45h320M0 84h320M28 0v24m62 0v21m65-45v24m88 0v21m57-45v24"/></g>
    <path d="M15 13h119m-99 0v8m77-8v8" stroke="#3c654a"/>
    <path d="M30 22h88" stroke="#b8bc85" stroke-width="2"/>
    <path d="m32 24-18 39h132l-25-39" fill="#9da36b" opacity=".035"/>
    <g stroke="#496a50" stroke-width="1.2">
      <path d="M18 63h202v10H18z" fill="#0a1b11"/>
      <path d="M23 64h192v6H23z" fill="url(#away-tread)"/>
      <path d="M32 74v8m171-8v8m-168 0h-9m172 0h10"/>
      <circle cx="25" cy="68" r="4"/><circle cx="213" cy="68" r="4"/>
    </g>
    <g class="away-scraps" stroke="#7e9d7c" stroke-width="1.1">
      <path d="m39 60 2-14 6-3 5 4 4 13z" fill="#344d37"/>
      <path d="m42 46 8 1m-7 6 7-2"/>
      <path d="m66 60-6-8 13-7 10 9-4 6z" fill="#667053"/><path d="m63 53 11 1 4-4"/>
      <path d="m96 59 2-16 7-2 5 4-1 15z" fill="#314d3c"/><path d="m99 47 10 1m-7-7v-3h6v5"/>
      <path d="m121 60 6-10 16 3 5 7" fill="#3d5340"/>
    </g>
    <g class="away-processing" stroke="#50755a" stroke-width="1.2">
      <path d="M176 20h8v54h-8zM216 20h8v54h-8z" fill="#1d3928"/>
      <path d="M173 17h55v7h-55z" fill="url(#away-metal)"/>
      <g class="away-piston"><path d="M199 24v16" stroke="#94b39a" stroke-width="3"/><path d="M184 39h32v6h-32z" fill="url(#away-metal)"/></g>
      <path d="M174 74h52v5h-52z" fill="#223f2d"/>
    </g>
    <g class="away-bale"><g class="away-bale-twitch" stroke="#739375" stroke-width="1.1">
      <path d="m237 54 5-5h25l5 5v20h-35z" fill="#264735"/>
      <path d="M237 54h35m-27-5v25m18-25v25m-23-15 11 3 6-4 11 6"/>
    </g></g>
    <g class="away-found" stroke="#c4b574" stroke-width="1.1">
      <path d="m286 62 5-4h12l5 4v14h-22z" fill="#3c432b"/><path d="M286 63h22m-15-5v18"/>
      <path class="away-find-glint" d="M297 39v10m-5-5h10m-17 6 3 2m19-2-3 2"/>
    </g>
    <path d="M7 7h8M7 7v8m306-8h-8m8 0v8M7 87h8m-8 0v-8m306 8h-8m8 0v-8" stroke="#36543e"/>
  </svg>`;
  return scene;
}
