import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FINISH, GREMLINS, LEVELS, PELLETS, START, START_LIVES, START_PRESETS, START_TOKENS } from './config';
import { buildDemo } from './demo';
import { computeGame, levelForDistance } from './game';
import { distM } from './geo';
import { GREMLIN_SPRITES, JOEY_FRAMES } from './sprites';

const T0 = 1_800_000_000_000;

test('before the host presses start, nothing counts', () => {
  const game = computeGame({ gameId: 'g', track: [{ ...START, t: T0 }], events: [] }, T0 + 1000);
  assert.equal(game.phase, 'waiting');
  assert.equal(game.score, 0);
  assert.equal(game.dotsEaten, 0);
  assert.ok(game.position, 'the Uber ride is still visible');
});

test('levels are distance rings and the start is level 1', () => {
  assert.equal(levelForDistance(distM(START, FINISH)), 0);
  assert.equal(levelForDistance(100), LEVELS.length - 1);
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].enterKm < LEVELS[i - 1].enterKm, 'rings shrink');
});

test('the scripted demo walk plays out a full game', () => {
  const demo = buildDemo(T0);
  const end = demo.track[demo.track.length - 1].t;
  const game = computeGame(demo, end + 1000);

  assert.equal(game.phase, 'home');
  assert.equal(game.maxLevel, LEVELS.length - 1);
  assert.deepEqual([...game.gremlinsCaught].sort(), ['cone', 'pothole']);
  assert.equal(game.lives, START_LIVES - 2);
  assert.equal(game.lostCount, 2);
  assert.ok(game.pelletsCollected.has('arlington-center'));
  assert.ok(game.pelletsCollected.has('teele'));
  assert.ok(game.pelletsCollected.has('powder-house'));
  assert.ok(game.progress === 1 || game.progress > 0.95);
  // tokens: start + pellets + 2 granted - (riddle 1 + landmark 2)
  assert.equal(game.tokens, START_TOKENS + game.pelletsCollected.size + 2 - 3);
  assert.ok(game.dotsEaten > 100);
  assert.ok(game.score > 0);
});

test('the same input always gives the same game (pure function)', () => {
  const demo = buildDemo(T0);
  const mid = demo.track[Math.floor(demo.track.length / 2)].t;
  const a = computeGame(demo, mid);
  const b = computeGame(demo, mid);
  assert.equal(a.score, b.score);
  assert.equal(a.status, b.status);
});

test('GPS teleports and bad accuracy are ignored', () => {
  const events = [{ id: 's', t: T0, type: 'start' as const }];
  const track = [
    { ...START, t: T0 + 1000 },
    { lat: START.lat + 0.00005, lng: START.lng, t: T0 + 6000 },
    { ...FINISH, t: T0 + 7000 }, // 12 km in one second
    { lat: START.lat + 0.0001, lng: START.lng, t: T0 + 11000, acc: 900 }, // junk accuracy
    { lat: START.lat + 0.0001, lng: START.lng, t: T0 + 12000 },
  ];
  const game = computeGame({ gameId: 'g', track, events }, T0 + 13000);
  assert.equal(game.phase, 'riding');
  assert.equal(game.path.length, 3);
});

test('no gremlin sits on a pellet, the start or the finish, and config ids are unique', () => {
  assert.equal(new Set(PELLETS.map((p) => p.id)).size, PELLETS.length);
  assert.equal(new Set(GREMLINS.map((g) => g.id)).size, GREMLINS.length);
  for (const g of GREMLINS) assert.ok(GREMLIN_SPRITES[g.kind], `sprite for ${g.kind}`);
  for (const p of PELLETS) for (const g of GREMLINS) assert.ok(distM(p, g) > 400, `${p.id} too close to ${g.id}`);
  for (const g of GREMLINS) assert.ok(distM(g, START) > 400 && distM(g, FINISH) > 400, `${g.id} too close to start or finish`);
  assert.equal(JOEY_FRAMES[0].length, JOEY_FRAMES[1].length);
});

test('the course fits a one-hour walk', () => {
  const km = distM(START, FINISH) / 1000;
  assert.ok(km > 2 && km < 3.5, `straight line is ${km.toFixed(2)} km`);
  for (const level of LEVELS.slice(1)) assert.ok(level.enterKm * 1000 < distM(START, FINISH), `${level.name} ring is outside the start`);
});

test('a host-chosen start replaces the default', () => {
  const custom = START_PRESETS[2];
  const game = computeGame({ gameId: 'g', track: [], events: [], course: custom }, T0);
  assert.equal(game.start.name, custom.name);
  assert.equal(computeGame({ gameId: 'g', track: [], events: [] }, T0).start.name, START.name);
});

test('a custom hint shows its own text and costs its tier', () => {
  const events = [
    { id: 's', t: T0, type: 'start' as const },
    { id: 'h', t: T0 + 1000, type: 'hint' as const, level: 0, tier: 2 as const, text: 'Look for the big theater sign.' },
  ];
  const game = computeGame({ gameId: 'g', track: [], events }, T0 + 2000);
  assert.equal(game.lastHint?.text, 'Look for the big theater sign.');
  assert.equal(game.tokens, START_TOKENS - 2);
});

test('every preset start is a reasonable distance from home', () => {
  for (const p of START_PRESETS) {
    const km = distM(p, FINISH) / 1000;
    assert.ok(km > 1.5 && km < 4, `${p.name} is ${km.toFixed(2)} km away`);
  }
});
