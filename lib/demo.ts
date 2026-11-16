import { FINISH, START } from './config';
import { computeGame, levelForDistance } from './game';
import { distM, lerp } from './geo';
import type { Fix, HostEvent, LatLng, RawState } from './types';

/**
 * Demo mode (open /?demo): a fake Joey rides a scripted route with two wrong
 * turns, so you can rehearse on the projector with no phone and no database.
 * Nothing here touches the server.
 */

const ROUTE: LatLng[] = [
  START,
  { lat: 42.29629, lng: -71.1282 }, // Peters Hill gate
  { lat: 42.2985, lng: -71.1225 },
  { lat: 42.30089, lng: -71.1139 }, // Forest Hills
  { lat: 42.3105, lng: -71.1075 }, // Green Street
  { lat: 42.3171, lng: -71.1042 }, // Stony Brook
  { lat: 42.3232, lng: -71.0998 }, // Jackson Square
  { lat: 42.3215, lng: -71.1085 }, // wrong turn west...
  { lat: 42.316, lng: -71.1185 }, // ...into the goose at Jamaica Pond
  { lat: 42.3215, lng: -71.1085 },
  { lat: 42.3232, lng: -71.0998 },
  { lat: 42.3314, lng: -71.0955 }, // Roxbury Crossing
  { lat: 42.3365, lng: -71.089 }, // Ruggles
  { lat: 42.3415, lng: -71.0835 }, // Mass Ave station
  { lat: 42.3427, lng: -71.0855 }, // Symphony
  { lat: 42.3489, lng: -71.0885 },
  { lat: 42.3512, lng: -71.0896 }, // Harvard Bridge, south end
  { lat: 42.3577, lng: -71.0927 }, // north end
  { lat: 42.3592, lng: -71.0935 }, // MIT
  { lat: 42.3654, lng: -71.1037 }, // Central Square
  { lat: 42.3737, lng: -71.1005 },
  { lat: 42.3796, lng: -71.0955 }, // Union Square
  { lat: 42.3812, lng: -71.087 }, // wrong turn east...
  { lat: 42.3842, lng: -71.0765 }, // ...into the rotary at Sullivan Square
  { lat: 42.389, lng: -71.088 },
  { lat: 42.3972, lng: -71.1043 }, // Magoun Square
  { lat: 42.3995, lng: -71.111 }, // Ball Square
  { lat: 42.40111, lng: -71.11672 }, // Powder House
  { lat: 42.405, lng: -71.117 },
  FINISH,
];

const SPEED_MPS = 4.5;
const STEP_M = 20;

// Small deterministic wobble so the trail looks like real GPS, not a ruler.
function wobble(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.00006;
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
