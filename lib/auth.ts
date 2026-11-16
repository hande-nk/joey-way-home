/**
 * Two secrets, set as Vercel environment variables:
 *   RIDER_KEY  lets Joey's phone post his location (and nothing else)
 *   HOST_KEY   lets the host start, reset, reveal hints, and place Joey by hand
 *
 * The key can arrive three ways so every client works:
 *   ?key=...            (rider page link, OwnTracks URL)
 *   x-game-key header   (our own fetch calls)
 *   HTTP Basic password (OwnTracks "password" field)
 */

export type Role = 'rider' | 'host';

function presentedKey(req: Request): string | null {
  const fromQuery = new URL(req.url).searchParams.get('key');
  if (fromQuery) return fromQuery;
  const fromHeader = req.headers.get('x-game-key');
  if (fromHeader) return fromHeader;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      return decoded.slice(decoded.indexOf(':') + 1) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Returns null when allowed, or a Response to send back when not. */
export function requireRole(req: Request, allowed: Role[]): Response | null {
  const riderKey = process.env.RIDER_KEY;
  const hostKey = process.env.HOST_KEY;

  if (!riderKey && !hostKey) {
    // Local development: no keys needed. In production we fail closed.
    if (process.env.NODE_ENV !== 'production') return null;
    return Response.json({ error: 'Set RIDER_KEY and HOST_KEY in the Vercel project settings.' }, { status: 503 });
  }

  const key = presentedKey(req);
  if (key && hostKey && key === hostKey && allowed.includes('host')) return null;
  if (key && riderKey && key === riderKey && allowed.includes('rider')) return null;
  return Response.json({ error: 'Wrong or missing key.' }, { status: 401 });
}
