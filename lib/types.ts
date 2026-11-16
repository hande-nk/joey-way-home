// Shared types. Everything the app knows about the game is one of these shapes.

export type LatLng = { lat: number; lng: number };

/** One GPS reading from Joey's phone. `t` is epoch milliseconds. */
export type Fix = LatLng & { t: number; acc?: number };

/** Things only the host can do from /control. */
export type HostEventType = 'start' | 'hint' | 'token' | 'finish';

export type HostEvent = {
  id: string;
  t: number;
  type: HostEventType;
  /** For hints: which level's hint (0-based) and which tier (1 riddle, 2 landmark, 3 direct). */
  level?: number;
  tier?: 1 | 2 | 3;
};

/**
 * The ONLY data we store. Score, level, lives, "is he lost" are all derived
 * from this by computeGame() in lib/game.ts, so they can never get out of sync.
 */
export type RawState = {
  gameId: string;
  track: Fix[];
  events: HostEvent[];
};
