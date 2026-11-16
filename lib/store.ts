import { Redis } from '@upstash/redis';
import type { Fix, HostEvent } from './types';

/**
 * Storage layer. Vercel functions are stateless: each request may hit a fresh
 * server with empty memory, so the track has to live in a database.
 * We use Upstash Redis (free, added from the Vercel dashboard in two clicks).
 *
 * With no Redis env vars (plain `npm run dev`) we fall back to memory so the
 * app still runs locally.
 */

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const usingRedis = redis !== null;

const KEY = { game: 'jwh:game', track: 'jwh:track', events: 'jwh:events' };
const MAX_FIXES = 20_000;

type Memory = { gameId: string; track: Fix[]; events: HostEvent[] };
const globalStore = globalThis as typeof globalThis & { __jwh?: Memory };
const memory: Memory = (globalStore.__jwh ??= { gameId: 'local', track: [], events: [] });

export type Snapshot = {
  gameId: string;
  /** Index of the first fix in `track` (lets clients fetch only what is new). */
  from: number;
  track: Fix[];
  total: number;
  events: HostEvent[];
};

export async function readSnapshot(knownGameId: string | null, knownCount: number): Promise<Snapshot> {
  if (!redis) {
    const from = knownGameId === memory.gameId ? Math.min(knownCount, memory.track.length) : 0;
    return { gameId: memory.gameId, from, track: memory.track.slice(from), total: memory.track.length, events: memory.events };
  }
  const gameId = (await redis.get<string>(KEY.game)) ?? 'new';
  const total = await redis.llen(KEY.track);
  const from = knownGameId === gameId ? Math.min(knownCount, total) : 0;
  const [track, events] = await Promise.all([
    from >= total ? Promise.resolve([] as Fix[]) : redis.lrange<Fix>(KEY.track, from, -1),
    redis.lrange<HostEvent>(KEY.events, 0, -1),
  ]);
  return { gameId, from, track, total: from + track.length, events };
}

export async function appendFix(fix: Fix): Promise<void> {
  if (!redis) {
    if (memory.track.length < MAX_FIXES) memory.track.push(fix);
    return;
  }
  if ((await redis.llen(KEY.track)) < MAX_FIXES) await redis.rpush(KEY.track, fix);
}

export async function appendEvent(event: HostEvent): Promise<void> {
  if (!redis) {
    memory.events.push(event);
    return;
  }
  await redis.rpush(KEY.events, event);
}

/** Wipe everything and start a new game. Viewers notice the new gameId and clear their screens. */
export async function resetGame(): Promise<string> {
  const gameId = `g${Date.now().toString(36)}`;
  if (!redis) {
    memory.gameId = gameId;
    memory.track = [];
    memory.events = [];
    return gameId;
  }
  await redis.multi().del(KEY.track).del(KEY.events).set(KEY.game, gameId).exec();
  return gameId;
}
