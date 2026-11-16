import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FINISH, GREMLINS, LEVELS, PELLETS, START, START_LIVES, START_TOKENS } from './config';
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

test('the scripted demo ride plays out a full game', () => {
  const demo = buildDemo(T0);
  const end = demo.track[demo.track.length - 1].t;
  const game = computeGame(demo, end + 1000);

  assert.equal(game.phase, 'home');
  assert.equal(game.maxLevel, LEVELS.length - 1);
  assert.deepEqual([...game.gremlinsCaught].sort(), ['goose', 'rotary']);
  assert.equal(game.lives, START_LIVES - 2);
  assert.equal(game.lostCount, 2);
  assert.ok(game.pelletsCollected.has('forest-hills'));
  assert.ok(game.pelletsCollected.has('harvard-bridge'));
  assert.ok(game.pelletsCollected.has('powder-house'));
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
    { lat: START.lat + 0.0002, lng: START.lng, t: T0 + 6000 },
    { ...FINISH, t: T0 + 7000 }, // 12 km in one second
    { lat: START.lat + 0.0004, lng: START.lng, t: T0 + 11000, acc: 900 }, // junk accuracy
    { lat: START.lat + 0.0004, lng: START.lng, t: T0 + 12000 },
  ];
  const game = computeGame({ gameId: 'g', track, events }, T0 + 13000);
  assert.equal(game.phase, 'riding');
  assert.equal(game.path.length, 3);
});

test('the par route never runs through a gremlin, and config ids are unique', () => {
  assert.equal(new Set(PELLETS.map((p) => p.id)).size, PELLETS.length);
  assert.equal(new Set(GREMLINS.map((g) => g.id)).size, GREMLINS.length);
  for (const g of GREMLINS) assert.ok(GREMLIN_SPRITES[g.kind], `sprite for ${g.kind}`);
  for (const p of PELLETS) for (const g of GREMLINS) assert.ok(distM(p, g) > 700, `${p.id} too close to ${g.id}`);
  assert.equal(JOEY_FRAMES[0].length, JOEY_FRAMES[1].length);
});
