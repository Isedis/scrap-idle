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
