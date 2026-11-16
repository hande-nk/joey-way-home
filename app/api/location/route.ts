import { requireRole } from '@/lib/auth';
import { appendFix } from '@/lib/store';
import type { Fix } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/location?key=...
 * Accepts a location from any of three senders:
 *   1. our /rider page          { lat, lng, acc, t }
 *   2. the OwnTracks phone app  { _type: "location", lat, lon, acc, tst }
 *   3. the host placing Joey by hand from /control
 * OwnTracks expects a JSON array back, so we always answer [].
 */
export async function POST(req: Request) {
  const denied = requireRole(req, ['rider', 'host']);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  // OwnTracks also sends status and waypoint messages. Acknowledge and ignore them.
  if (typeof body._type === 'string' && body._type !== 'location') return Response.json([]);

  const lat = Number(body.lat);
  const lng = Number(body.lng ?? body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: 'lat and lng (or lon) are required numbers.' }, { status: 400 });
  }

  const now = Date.now();
  let t = now;
  if (Number.isFinite(Number(body.tst))) t = Number(body.tst) * 1000; // OwnTracks: seconds
  else if (Number.isFinite(Number(body.t))) t = Number(body.t);
  if (t > now + 60_000) t = now; // a phone clock from the future would break ordering

  const fix: Fix = { lat, lng, t };
  const acc = Number(body.acc);
  if (Number.isFinite(acc) && acc >= 0) fix.acc = Math.round(acc);

  try {
    await appendFix(fix);
  } catch (err) {
    console.error('location write failed', err);
    return Response.json({ error: 'Could not save location.' }, { status: 500 });
  }
  return Response.json([]);
}
