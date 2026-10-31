/** How often an open game asks whether a newer build is out. */
export const CHECK_EVERY_MS = 5 * 60_000;

type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** The id of the build currently published, or null when it cannot be read (offline, dev server, bad file). */
export async function latestBuild(fetcher: Fetcher, url = 'version.json'): Promise<string | null> {
  try {
    const res = await fetcher(`${url}?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data?.build === 'string' && data.build ? data.build : null;
  } catch {
    return null;
  }
}

/** The published build id when it differs from the running one, otherwise null. */
export async function findNewBuild(current: string, fetcher: Fetcher, url = 'version.json'): Promise<string | null> {
  const build = await latestBuild(fetcher, url);
  return build && build !== current ? build : null;
}

/** Loads the new build. The query string makes the phone skip its cached copy of the page. */
export function reloadInto(build: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('v', build);
  window.location.replace(url.toString());
}

export interface Release { build: string; author: string | null; summary: string }
export async function latestRelease(fetcher: Fetcher): Promise<Release | null> {
  try {
    const response = await fetcher(`version.json?t=${Date.now()}`);
    if (!response.ok) return null;
    const data = await response.json() as Partial<Release> | null;
    if (!data || typeof data.build !== 'string' || !/^[a-zA-Z0-9-]+$/.test(data.build)) return null;
    return { build: data.build, author: data.author === 'Codex' ? 'Codex' : null, summary: typeof data.summary === 'string' ? data.summary : '' };
  } catch { return null; }
}

/** Register once. The worker pins the first complete build without opting into future ones. */
export async function registerUpdates(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }); }
  catch { return null; }
}

/** Only the explicit Update action can change the selected game. */
export async function selectRelease(build: string): Promise<boolean> {
  const registration = await registerUpdates();
  if (!registration) return false;
  try {
    await registration.update();
    const installing = registration.installing;
    if (installing && installing.state !== 'activated' && installing.state !== 'redundant') {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { installing.removeEventListener('statechange', check); reject(new Error('timeout')); }, 30_000);
        const check = () => {
          if (installing.state !== 'activated' && installing.state !== 'redundant') return;
          clearTimeout(timeout);
          installing.removeEventListener('statechange', check);
          resolve();
        };
        installing.addEventListener('statechange', check);
        check();
      });
    }
    const worker = registration.active;
    if (!worker) return false;
    return await new Promise<boolean>(resolve => {
      const channel = new MessageChannel();
      const finish = (ok: boolean) => { clearTimeout(timeout); channel.port1.close(); resolve(ok); };
      const timeout = setTimeout(() => finish(false), 10_000);
      channel.port1.onmessage = event => finish(event.data?.ok === true);
      worker.postMessage({ type: 'SELECT_BUILD', build }, [channel.port2]);
    });
  } catch { return false; }
}
