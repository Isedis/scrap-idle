// Stroke icons on a 24×24 grid; colour comes from `currentColor`.
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  collector: svg('<path d="M8 7c0-2 1.8-3.5 4-3.5S16 5 16 7"/><path d="M6 8h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z"/><path d="M10 12v5M14 12v5"/>'),
  cart: svg('<path d="M3 5h2.5l2 10h10l2-7H7"/><circle cx="9.5" cy="19" r="1.6"/><circle cx="16.5" cy="19" r="1.6"/>'),
  truck: svg('<path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 10h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>'),
  sorter: svg('<path d="M3 15h18"/><circle cx="6" cy="17.5" r="1.5"/><circle cx="18" cy="17.5" r="1.5"/><path d="M7 11l3-3 3 3M14 6h4v6"/>'),
  press: svg('<path d="M4 3.5h16M12 3.5v6M6 9.5h12v3H6z"/><path d="M7 20.5h10l-1-5H8z"/>'),
  plant: svg('<path d="M3 20.5V10l5 3V10l5 3V5.5h4l1 7.5v7.5z"/><path d="M3 20.5h18M7 17h2M12 17h2"/>'),
  landfill: svg('<path d="M2.5 20.5h19"/><path d="M4 20.5c2-4 4-6 8-6s6 2 8 6"/><path d="M7 15.5c1.5-3 3-4.5 5-4.5s3.5 1.5 5 4.5"/><path d="M12 11V4l4 1.5L12 7"/>'),
  incinerator: svg('<path d="M4 20.5V11h7v9.5M11 20.5V8h4v12.5M15 20.5h5V14h-5"/><path d="M12.5 5.5c-1-1 .5-2 0-3 1.5.8 1.8 2 .8 3"/>'),
  orbital: svg('<rect x="9" y="9" width="6" height="6" rx="1"/><path d="M3 9.5l6 1.5M3 14.5l6-1.5M21 9.5l-6 1.5M21 14.5l-6-1.5"/><path d="M12 9V5.5M10.5 4h3"/>'),
  singularity: svg('<circle cx="12" cy="12" r="2.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5M20.5 12a8.5 8.5 0 0 1-8.5 8.5M12 20.5A8.5 8.5 0 0 1 3.5 12M3.5 12A8.5 8.5 0 0 1 12 3.5"/><path d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5M6.5 12A5.5 5.5 0 0 0 12 17.5"/>'),
  global: svg('<path d="M12 3.5l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z"/>'),
  synergy: svg('<path d="M9.5 14.5l5-5"/><path d="M11 7l1.5-1.5a3.5 3.5 0 0 1 5 5L16 12M13 17l-1.5 1.5a3.5 3.5 0 0 1-5-5L8 12"/>'),
  upgrades: svg('<path d="M12 20.5v-11M7.5 14l4.5-4.5 4.5 4.5"/><path d="M5 3.5h14"/>'),
  locked: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  heap: svg('<path d="M2.5 19.5h19"/><path d="M4 19.5l3.5-6 2.5 2.5 3.5-6.5 3 5 1.5-2 2.5 7"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>'),
};
