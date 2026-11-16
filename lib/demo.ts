import { FINISH, START } from './config';
import { computeGame, levelForDistance } from './game';
import { distM, lerp } from './geo';
import type { Fix, HostEvent, LatLng, RawState } from './types';

/**
 * Demo mode (open /?demo): a fake Joey walks a scripted route with two wrong
 * turns, so you can rehearse on the projector with no phone and no database.
 * Nothing here touches the server.
 */

const ROUTE: LatLng[] = [
  START, // Spy Pond Park
  { lat: 42.4146, lng: -71.1507 }, // Arlington Center
  { lat: 42.415, lng: -71.156 }, // wrong way west on Mass Ave...
  { lat: 42.4125, lng: -71.1625 },
  { lat: 42.4109, lng: -71.1668 }, // ...into the Pothole at Menotomy Rocks
  { lat: 42.4125, lng: -71.1625 },
  { lat: 42.415, lng: -71.156 },
  { lat: 42.4146, lng: -71.1507 }, // back at Arlington Center
  { lat: 42.4115, lng: -71.144 }, // Broadway east
  { lat: 42.409, lng: -71.1385 },
  { lat: 42.4069, lng: -71.1336 }, // town line
  { lat: 42.4011, lng: -71.1285 }, // Teele Square
  { lat: 42.3967, lng: -71.1223 }, // Davis Square
  { lat: 42.3935, lng: -71.1228 }, // wrong way south...
  { lat: 42.392, lng: -71.123 }, // ...into Cone Zone at Porter
  { lat: 42.3935, lng: -71.1228 },
  { lat: 42.3967, lng: -71.1223 },
  { lat: 42.3992, lng: -71.1195 }, // College Ave
  { lat: 42.4011, lng: -71.1167 }, // Powder House
  { lat: 42.405, lng: -71.1168 },
  FINISH,
];

const SPEED_MPS = 1.5; // brisk walk
const STEP_M = 10;

// Small deterministic wobble so the trail looks like real GPS, not a ruler.
function wobble(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.00003;
}

export function buildDemo(startAt: number): RawState {
  const track: Fix[] = [];
  let t = startAt + 2000;
  let n = 0;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i];
    const b = ROUTE[i + 1];
    const steps = Math.max(1, Math.round(distM(a, b) / STEP_M));
    for (let s = 0; s < steps; s++) {
      const p = lerp(a, b, s / steps);
      track.push({ lat: p.lat + wobble(n), lng: p.lng + wobble(n + 500), t, acc: 8 });
      t += (STEP_M / SPEED_MPS) * 1000;
      n++;
    }
  }
  track.push({ ...FINISH, t, acc: 8 });

  // The scripted host: grants a token and reveals a hint each time he gets lost.
  const events: HostEvent[] = [{ id: 'demo-start', t: startAt, type: 'start' }];
  const dryRun = computeGame({ gameId: 'demo', track, events }, t);
  dryRun.log
    .filter((entry) => entry.kind === 'lost')
    .forEach((entry, i) => {
      const at = track.find((f) => f.t >= entry.t) ?? track[track.length - 1];
      events.push({ id: `demo-token-${i}`, t: entry.t + 40_000, type: 'token' });
      events.push({
        id: `demo-hint-${i}`,
        t: entry.t + 75_000,
        type: 'hint',
        level: levelForDistance(distM(at, FINISH)),
        tier: i === 0 ? 1 : 2,
      });
    });

  return { gameId: 'demo', track, events };
}
