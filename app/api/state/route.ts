import { readSnapshot } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/state?g=<gameId I have>&n=<how many fixes I have>
 * Public and read-only. Viewers poll this every couple of seconds.
 * Sending g and n means we only return the fixes the viewer has not seen yet.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const knownGameId = params.get('g');
  const knownCount = Math.max(0, Number(params.get('n')) || 0);
  try {
    const snapshot = await readSnapshot(knownGameId, knownCount);
    return Response.json({ ...snapshot, serverNow: Date.now() }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('state read failed', err);
    return Response.json({ error: 'Could not read game state.' }, { status: 500 });
  }
}
