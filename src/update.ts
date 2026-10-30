/** How often an open game asks whether a newer build is out. */
export const CHECK_EVERY_MS = 5 * 60_000;

type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Returns the id of the published build when it differs from the running one,
 * null when they match or the check fails (offline, dev server, bad file).
 */
export async function findNewBuild(current: string, fetcher: Fetcher, url = 'version.json'): Promise<string | null> {
  try {
    const res = await fetcher(`${url}?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data?.build === 'string' && data.build && data.build !== current ? data.build : null;
  } catch {
    return null;
  }
}

/** Loads the new build. The query string makes the phone skip its cached copy of the page. */
export function reloadInto(build: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('v', build);
  window.location.replace(url.toString());
}
