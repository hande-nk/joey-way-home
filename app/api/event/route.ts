import { requireRole } from '@/lib/auth';
import { FINISH, LEVELS, MAX_START_KM } from '@/lib/config';
import { distM } from '@/lib/geo';
import { appendEvent, resetGame, setCourse } from '@/lib/store';
import type { HostEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/event  (host only)
 *   { type: "start" }                    blindfold off, clock starts
 *   { type: "hint", level, tier }        reveal a hint, spends `tier` tokens
 *   { type: "token" }                    the room won a challenge: +1 token
 *   { type: "finish" }                   manual finish if GPS misses the line
 *   { type: "reset" }                    wipe the game (keeps the chosen start)
 *   { type: "course", lat, lng, name }   move the start line
 * A hint can carry `text` to send a custom hint instead of the written one.
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

    if (body.type === 'course') {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : 'Custom start';
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return Response.json({ error: 'course needs lat and lng.' }, { status: 400 });
      }
      if (distM({ lat, lng }, FINISH) > MAX_START_KM * 1000) {
        return Response.json({ error: `The start must be within ${MAX_START_KM} km of the finish.` }, { status: 400 });
      }
      await setCourse({ lat, lng, name });
      return Response.json({ ok: true });
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
      if (typeof body.text === 'string' && body.text.trim()) event.text = body.text.trim().slice(0, 300);
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
