import { requireRole } from '@/lib/auth';
import { LEVELS } from '@/lib/config';
import { appendEvent, resetGame } from '@/lib/store';
import type { HostEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/event  (host only)
 *   { type: "start" }                    blindfold off, clock starts
 *   { type: "hint", level, tier }        reveal a hint, spends `tier` tokens
 *   { type: "token" }                    the room won a challenge: +1 token
 *   { type: "finish" }                   manual finish if GPS misses the line
 *   { type: "reset" }                    wipe the game
 */
export async function POST(req: Request) {
  const denied = requireRole(req, ['host']);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  try {
    if (body.type === 'reset') {
      return Response.json({ ok: true, gameId: await resetGame() });
    }

    const event: HostEvent = { id: crypto.randomUUID(), t: Date.now(), type: 'start' };

    if (body.type === 'start' || body.type === 'token' || body.type === 'finish') {
      event.type = body.type;
    } else if (body.type === 'hint') {
      const level = Number(body.level);
      const tier = Number(body.tier);
      if (!Number.isInteger(level) || !LEVELS[level] || ![1, 2, 3].includes(tier)) {
        return Response.json({ error: 'hint needs a valid level and tier 1-3.' }, { status: 400 });
      }
      event.type = 'hint';
      event.level = level;
      event.tier = tier as 1 | 2 | 3;
    } else {
      return Response.json({ error: 'Unknown event type.' }, { status: 400 });
    }

    await appendEvent(event);
    return Response.json({ ok: true, event });
  } catch (err) {
    console.error('event write failed', err);
    return Response.json({ error: 'Could not save event.' }, { status: 500 });
  }
}
