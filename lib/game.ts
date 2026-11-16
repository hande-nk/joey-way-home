import {
  DOT_SPACING_M,
  DRIFTING_M,
  EAT_RADIUS_M,
  FINISH,
  FINISH_RADIUS_M,
  GAP_M,
  FOUND_M,
  GREMLINS,
  GREMLIN_RADIUS_M,
  GRID,
  HINT_TIER_NAMES,
  LEVELS,
  LOST_M,
  MAX_ACCURACY_M,
  MAX_SPEED_MPS,
  PAR_MINUTES,
  PELLETS,
  PELLET_RADIUS_M,
  POINTS,
  PROGRESS_STEP_M,
  ROOM_CHALLENGES,
  STALL_MS,
  START,
  START_LIVES,
  START_TOKENS,
} from './config';
import { bearingDeg, distM, distToSegmentM, lerp } from './geo';
import type { Course, Fix, LatLng, RawState } from './types';

/**
 * computeGame is a PURE function: same input, same output, no side effects.
 * The server only stores GPS fixes and host button presses. Everything on the
 * screen (score, level, lives, "lost") is recomputed from those every time.
 * That is why a page refresh, a second viewer, or a late joiner always sees
 * the exact same game.
 */

export type Status = 'WAITING' | 'ON TRACK' | 'DRIFTING' | 'LOST' | 'HOME';
export type Trend = 'WARMER' | 'COLDER' | 'STEADY';
export type LogKind = 'start' | 'level' | 'pellet' | 'gremlin' | 'lost' | 'found' | 'hint' | 'token' | 'home';
export type LogEntry = { id: string; t: number; kind: LogKind; title: string; sub?: string };

export type Game = {
  /** The start line in use: the host's choice, or the default. */
  start: Course;
  phase: 'waiting' | 'riding' | 'home';
  startedAt: number | null;
  finishedAt: number | null;
  elapsedMs: number;
  /** Latest fix of any kind (also before the start, while he is in the Uber). */
  position: Fix | null;
  headingDeg: number;
  /** Accepted fixes since the start. This is the trail. */
  path: Fix[];
  distanceHomeM: number | null;
  /** 0 at the start line, 1 at home, by straight-line distance. */
  progress: number;
  closestM: number | null;
  driftM: number;
  riddenM: number;
  level: number;
  maxLevel: number;
  status: Status;
  trend: Trend;
  eaten: Set<string>;
  dotsEaten: number;
  pelletsCollected: Set<string>;
  gremlinsCaught: Set<string>;
  lives: number;
  tokens: number;
  score: number;
  lostCount: number;
  activeChallenge: string | null;
  lastHint: { level: number; tier: 1 | 2 | 3; text: string; t: number } | null;
  log: LogEntry[];
};

// ---------------------------------------------------------------- dot grid

const D_LAT = DOT_SPACING_M / 111_320;
const D_LNG = DOT_SPACING_M / (111_320 * Math.cos((((GRID.south + GRID.north) / 2) * Math.PI) / 180));
export const GRID_ROWS = Math.floor((GRID.north - GRID.south) / D_LAT);
export const GRID_COLS = Math.floor((GRID.east - GRID.west) / D_LNG);

export const dotKey = (row: number, col: number) => `${row},${col}`;
export const dotLatLng = (row: number, col: number): LatLng => ({
  lat: GRID.south + row * D_LAT,
  lng: GRID.west + col * D_LNG,
});
export const dotRow = (lat: number) => Math.round((lat - GRID.south) / D_LAT);
export const dotCol = (lng: number) => Math.round((lng - GRID.west) / D_LNG);

function eatAround(p: LatLng, eaten: Set<string>) {
  const r0 = dotRow(p.lat);
  const c0 = dotCol(p.lng);
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (r < 0 || c < 0 || r > GRID_ROWS || c > GRID_COLS) continue;
      if (distM(p, dotLatLng(r, c)) <= EAT_RADIUS_M) eaten.add(dotKey(r, c));
    }
  }
}

// ---------------------------------------------------------------- levels

export function levelForDistance(distanceM: number): number {
  let level = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (distanceM <= LEVELS[i].enterKm * 1000) level = i;
  }
  return level;
}

// ---------------------------------------------------------------- the game

export function computeGame(raw: RawState, now: number): Game {
  const start: Course = raw.course ?? START;
  const events = [...raw.events].sort((a, b) => a.t - b.t);
  const track = [...raw.track].sort((a, b) => a.t - b.t);

  const startEvent = [...events].reverse().find((e) => e.type === 'start');
  const startedAt = startEvent ? startEvent.t : null;

  const log: LogEntry[] = [];
  const eaten = new Set<string>();
  const pelletsCollected = new Set<string>();
  const gremlinsCaught = new Set<string>();
  const path: Fix[] = [];

  let finishedAt: number | null = null;
  let riddenM = 0;
  let closestM: number | null = null;
  let progressMarkM = Infinity;
  let lastProgressT = startedAt ?? 0;
  let maxLevel = 0;
  let lost = false;
  let lostBecause: 'drift' | 'stall' = 'drift';
  let lostCount = 0;
  let lastLostT = 0;

  if (startedAt !== null) {
    log.push({ id: `start-${startedAt}`, t: startedAt, kind: 'start', title: 'Blindfold off', sub: 'Get home, Joey.' });
  }

  for (const fix of track) {
    if (startedAt === null || fix.t < startedAt) continue;
    if (finishedAt !== null) break;
    if (fix.acc !== undefined && fix.acc > MAX_ACCURACY_M) continue;

    const prev = path[path.length - 1];
    let stepM = 0;
    if (prev) {
      stepM = distM(prev, fix);
      const dt = (fix.t - prev.t) / 1000;
      if (dt <= 0) continue;
      if (stepM / dt > MAX_SPEED_MPS) continue; // GPS teleport, ignore
    }
    path.push(fix);
    riddenM += stepM;

    // Dots: eat along the segment he just rode (unless it is a long signal gap).
    if (prev && stepM < GAP_M) {
      const steps = Math.max(1, Math.ceil(stepM / 40));
      for (let s = 1; s <= steps; s++) eatAround(lerp(prev, fix, s / steps), eaten);
    } else {
      eatAround(fix, eaten);
    }

    const from = prev && stepM < GAP_M ? prev : fix;

    for (const pellet of PELLETS) {
      if (pelletsCollected.has(pellet.id)) continue;
      if (distToSegmentM(pellet, from, fix) <= (pellet.radiusM ?? PELLET_RADIUS_M)) {
        pelletsCollected.add(pellet.id);
        log.push({ id: `pellet-${pellet.id}`, t: fix.t, kind: 'pellet', title: `Hint pellet: ${pellet.name}`, sub: pellet.clue });
      }
    }

    for (const gremlin of GREMLINS) {
      if (gremlinsCaught.has(gremlin.id)) continue;
      if (distToSegmentM(gremlin, from, fix) <= GREMLIN_RADIUS_M) {
        gremlinsCaught.add(gremlin.id);
        log.push({ id: `gremlin-${gremlin.id}`, t: fix.t, kind: 'gremlin', title: `Caught by ${gremlin.name}`, sub: `${gremlin.place}. Dare: ${gremlin.dare}` });
      }
    }

    const homeM = distM(fix, FINISH);
    const level = levelForDistance(homeM);
    while (maxLevel < level) {
      maxLevel++;
      log.push({ id: `level-${maxLevel}`, t: fix.t, kind: 'level', title: `Level ${maxLevel + 1}: ${LEVELS[maxLevel].name}`, sub: 'New hints unlocked.' });
    }

    closestM = closestM === null ? homeM : Math.min(closestM, homeM);
    if (closestM <= progressMarkM - PROGRESS_STEP_M) {
      progressMarkM = closestM;
      lastProgressT = fix.t;
    }
    const driftM = homeM - closestM;
    const stalled = fix.t - lastProgressT >= STALL_MS;

    if (homeM <= FINISH_RADIUS_M) {
      finishedAt = fix.t;
      log.push({ id: 'home', t: fix.t, kind: 'home', title: 'Joey is home', sub: 'Snacks are served.' });
      break;
    }

    if (!lost && (driftM >= LOST_M || stalled)) {
      lost = true;
      lostBecause = driftM >= LOST_M ? 'drift' : 'stall';
      lostCount++;
      lastLostT = fix.t;
      log.push({
        id: `lost-${lostCount}`,
        t: fix.t,
        kind: 'lost',
        title: 'Joey is lost',
        sub: `Room challenge: ${ROOM_CHALLENGES[(lostCount - 1) % ROOM_CHALLENGES.length]}`,
      });
    } else if (lost) {
      // Lost by drifting: found once he is nearly back to his best distance.
      // Lost by stalling: found once he makes real progress again.
      const recovered = lostBecause === 'drift' ? driftM <= FOUND_M : lastProgressT === fix.t;
      if (recovered) {
        lost = false;
        lastProgressT = fix.t; // fresh stall window
        log.push({ id: `found-${lostCount}`, t: fix.t, kind: 'found', title: 'Back on track', sub: 'Nice recovery.' });
      }
    }
  }

  // Host button presses.
  let tokensSpent = 0;
  let tokensGranted = 0;
  let lastHint: Game['lastHint'] = null;
  for (const e of events) {
    if (startedAt === null || e.t < startedAt) continue;
    if (e.type === 'hint' && e.level !== undefined && e.tier !== undefined && LEVELS[e.level]) {
      tokensSpent += e.tier;
      const text = e.text ?? LEVELS[e.level].hints[e.tier - 1];
      lastHint = { level: e.level, tier: e.tier, text, t: e.t };
      log.push({ id: e.id, t: e.t, kind: 'hint', title: `Hint: ${HINT_TIER_NAMES[e.tier - 1]}`, sub: text });
    } else if (e.type === 'token') {
      tokensGranted++;
      log.push({ id: e.id, t: e.t, kind: 'token', title: '+1 hint token', sub: 'The room earned it.' });
    } else if (e.type === 'finish' && finishedAt === null) {
      finishedAt = e.t;
      log.push({ id: e.id, t: e.t, kind: 'home', title: 'Joey is home', sub: 'Snacks are served.' });
    }
  }
  log.sort((a, b) => a.t - b.t);

  const position = track.length ? track[track.length - 1] : null;
  const last = path[path.length - 1] ?? null;
  const distanceHomeM = last ? distM(last, FINISH) : position ? distM(position, FINISH) : null;
  const driftM = last && closestM !== null ? Math.max(0, distM(last, FINISH) - closestM) : 0;
  const level = distanceHomeM !== null && startedAt !== null ? levelForDistance(distanceHomeM) : 0;
  const courseM = distM(start, FINISH);
  const progress = distanceHomeM === null || startedAt === null ? 0 : Math.max(0, Math.min(1, 1 - distanceHomeM / courseM));

  // Hot or cold: compare with where he was about a minute ago.
  let trend: Trend = 'STEADY';
  if (last) {
    const earlier = [...path].reverse().find((f) => f.t <= last.t - 60_000);
    if (earlier) {
      const delta = distM(earlier, FINISH) - distM(last, FINISH);
      if (delta > 30) trend = 'WARMER';
      else if (delta < -30) trend = 'COLDER';
    }
  }

  // Heading: look back far enough that GPS jitter does not flip him around.
  let headingDeg = 90;
  const headingSource = startedAt === null ? track : path;
  const tip = headingSource[headingSource.length - 1];
  if (tip) {
    for (let i = headingSource.length - 2; i >= 0; i--) {
      if (distM(headingSource[i], tip) >= 15) {
        headingDeg = bearingDeg(headingSource[i], tip);
        break;
      }
    }
  }

  const lives = Math.max(0, START_LIVES - gremlinsCaught.size);
  const tokens = Math.max(0, START_TOKENS + pelletsCollected.size + tokensGranted - tokensSpent);
  const elapsedMs = startedAt === null ? 0 : (finishedAt ?? now) - startedAt;

  let score =
    eaten.size * POINTS.dot +
    pelletsCollected.size * POINTS.pellet +
    maxLevel * POINTS.level +
    gremlinsCaught.size * POINTS.gremlin;
  if (finishedAt !== null) {
    const minutesSaved = Math.max(0, PAR_MINUTES - elapsedMs / 60_000);
    score += lives * POINTS.lifeBonus + Math.round(minutesSaved * POINTS.perMinuteUnderPar);
  }
  score = Math.max(0, score);

  const phase: Game['phase'] = startedAt === null ? 'waiting' : finishedAt !== null ? 'home' : 'riding';
  const status: Status =
    phase === 'waiting' ? 'WAITING' : phase === 'home' ? 'HOME' : lost ? 'LOST' : driftM >= DRIFTING_M ? 'DRIFTING' : 'ON TRACK';

  return {
    start,
    phase,
    startedAt,
    finishedAt,
    elapsedMs,
    position,
    headingDeg,
    path,
    distanceHomeM,
    progress,
    closestM,
    driftM,
    riddenM,
    level,
    maxLevel,
    status,
    trend,
    eaten,
    dotsEaten: eaten.size,
    pelletsCollected,
    gremlinsCaught,
    lives,
    tokens,
    score,
    lostCount,
    activeChallenge:
      status === 'LOST' && lastLostT > 0 ? ROOM_CHALLENGES[(lostCount - 1) % ROOM_CHALLENGES.length] : null,
    lastHint,
    log,
  };
}
