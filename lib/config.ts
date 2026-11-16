import type { LatLng } from './types';

/**
 * THE WHOLE GAME IS CONFIGURED HERE.
 * Change the drop-off, the finish, the hints or the scoring in this one file.
 * Nothing else in the app hard-codes a place.
 *
 * Course: Joey WALKS from Spy Pond Park in Arlington to the Joyce Cummings
 * Center. About 2.8 km in a straight line and roughly 4.5 km on streets.
 * The host can move the start from /control (presets or a click on the map).
 */

// ---------------------------------------------------------------- course

/** Default start: where the blindfold comes off. The host can change it on /control. */
export const START: LatLng & { name: string } = {
  name: 'Spy Pond Park',
  lat: 42.4113373,
  lng: -71.1510255,
};

/** One-click start options on /control. The host can also click any spot on the map. */
export const START_PRESETS: (LatLng & { name: string })[] = [
  START,
  { name: 'Arlington Center', lat: 42.4146167, lng: -71.1507497 },
  { name: 'Somerville City Hall', lat: 42.3871772, lng: -71.09813 },
  { name: 'Prospect Hill Park', lat: 42.3817338, lng: -71.0936816 },
];

/** A start must be within this distance of the finish. */
export const MAX_START_KM = 8;

/** Finish line. Joyce Cummings Center. Swap the coordinates if you booked another building. */
export const FINISH: LatLng & { name: string } = {
  name: 'JCC',
  lat: 42.4081564,
  lng: -71.1166988,
};

/** He is home when a GPS fix lands this close to FINISH. */
export const FINISH_RADIUS_M = 70;

// ---------------------------------------------------------------- levels
// Levels are rings of straight-line distance to the finish, so they work on
// ANY route he takes. Level i starts once he is within enterKm of home.

export type Level = {
  name: string;
  enterKm: number;
  /** Three hints, read aloud to Joey. Cost: 1, 2, 3 tokens. */
  hints: [riddle: string, landmark: string, direct: string];
};

// Level names are about distance, not places, so they still make sense if the host
// moves the start. The written hints follow the default Spy Pond route; for any other
// start, the host can type a custom hint on /control.
export const LEVELS: Level[] = [
  {
    name: 'The Start',
    enterKm: Infinity,
    hints: [
      'Home is where the sun rises. Follow the road that shares its name with the bright lights of New York.',
      'Walk up to Arlington Center, where Mass Ave meets Broadway. Then take Broadway east.',
      'Take Broadway east out of Arlington Center and stay on it. It crosses into Somerville.',
    ],
  },
  {
    name: 'Getting Warmer',
    enterKm: 2.2,
    hints: [
      'A brook named after a fish marks the town line. Cross it and keep going.',
      'Stay on Broadway across Alewife Brook Parkway. You are in Somerville now.',
      'Keep going east on Broadway to Teele Square, where it meets Holland Street.',
    ],
  },
  {
    name: 'Halfway',
    enterKm: 1.5,
    hints: [
      'Two squares left. The second one is named after gunpowder.',
      'Past Teele Square, keep on Broadway to the Powder House rotary with the stone tower.',
      'At Powder House Square, take College Ave north, uphill toward campus.',
    ],
  },
  {
    name: 'Close',
    enterKm: 1.05,
    hints: [
      'The stone tower guards the last roundabout before home.',
      'From Powder House Square, College Ave climbs north to campus.',
      'College Ave all the way to Boston Ave. JCC is on that corner, by the end of the Green Line.',
    ],
  },
  {
    name: 'Home Stretch',
    enterKm: 0.45,
    hints: [
      'You can smell the snacks from here.',
      'Find the end of the Green Line. The finish is the building right next to it.',
      'Joyce Cummings Center, College Ave at Boston Ave. Come up to the room.',
    ],
  },
];

export const HINT_TIER_NAMES = ['Riddle', 'Landmark', 'Direct'] as const;

// ---------------------------------------------------------------- hint pellets
// Artificial hint pickups placed on real landmarks. Walking through one gives
// +1 hint token, points, and a clue the room may read to Joey.

export type Pellet = LatLng & { id: string; name: string; clue: string; radiusM?: number };

export const PELLET_RADIUS_M = 60;

export const PELLETS: Pellet[] = [
  { id: 'arlington-center', name: 'Arlington Center', lat: 42.4146167, lng: -71.1507497, clue: 'Mass Ave meets Broadway here. Broadway heads east, toward home.' },
  { id: 'capitol', name: 'Capitol Theatre', lat: 42.4058647, lng: -71.1427307, clue: 'Mass Ave in East Arlington. Home is north-east of here.' },
  { id: 'minuteman', name: 'Minuteman Bikeway', lat: 42.4043303, lng: -71.1468806, clue: 'East on the bikeway leads to Alewife, where a path runs on to Davis Square.' },
  { id: 'alewife', name: 'Alewife station', lat: 42.3957984, lng: -71.1414616, clue: 'End of the Red Line. The Community Path to Davis Square starts here.' },
  { id: 'town-line', name: 'Town line', lat: 42.4069078, lng: -71.1335618, clue: 'Alewife Brook is the Arlington and Somerville line. Broadway keeps going east.' },
  { id: 'teele', name: 'Teele Square', lat: 42.4011175, lng: -71.1285122, clue: 'Broadway meets Holland St. Keep going east on Broadway.' },
  { id: 'davis', name: 'Davis Square', lat: 42.3967172, lng: -71.1223151, clue: 'You know this place. College Ave runs from here to campus.' },
  { id: 'powder-house', name: 'Powder House', lat: 42.4011135, lng: -71.116722, clue: 'The stone tower. Walk north up College Ave to campus.' },
  { id: 'ball', name: 'Ball Sq station', lat: 42.39989, lng: -71.111, clue: 'One stop from home. Boston Ave starts here.' },
  { id: 'magoun', name: 'Magoun Sq station', lat: 42.39368, lng: -71.10639, clue: 'Two stops from home. Broadway is one block north.' },
  { id: 'gilman', name: 'Gilman Sq station', lat: 42.38793, lng: -71.09677, clue: 'Green Line, Medford branch. The last stop on this line is home.' },
];

// ---------------------------------------------------------------- gremlins
// Wrong-turn traps. Walk into a zone and the gremlin catches you:
// lose a life and do the dare.

export type GremlinKind = 'goose' | 'cone' | 'truck' | 'pothole';
export type Gremlin = LatLng & { id: string; kind: GremlinKind; name: string; place: string; dare: string };

export const GREMLIN_RADIUS_M = 160;

export const GREMLINS: Gremlin[] = [
  { id: 'pothole', kind: 'pothole', name: 'The Pothole', place: 'Menotomy Rocks', lat: 42.4107892, lng: -71.167854, dare: 'Recite our project tech stack from memory.' },
  { id: 'goose', kind: 'goose', name: 'The Goose', place: 'Fresh Pond', lat: 42.3815866, lng: -71.1451536, dare: 'Give us your best goose honk. Loud.' },
  { id: 'cone', kind: 'cone', name: 'Cone Zone', place: 'Porter Square', lat: 42.3913695, lng: -71.1232582, dare: 'Ten seconds of traffic cop. Direct an imaginary intersection.' },
  { id: 'truck', kind: 'truck', name: 'The Truck', place: 'Medford Square', lat: 42.4177904, lng: -71.1089559, dare: 'Name three teammates and one nice thing about each.' },
];

// ---------------------------------------------------------------- lost detection

/** Drift = how much farther from home he is now than his closest approach so far. */
export const DRIFTING_M = 120;
export const LOST_M = 250;
/** He counts as found again once drift is back under this. */
export const FOUND_M = 80;
/** No real progress toward home for this long also counts as lost. */
export const STALL_MS = 7 * 60 * 1000;
export const PROGRESS_STEP_M = 15;

/** When he is lost, the room plays one of these to earn him a free hint token. */
export const ROOM_CHALLENGES: string[] = [
  'Neighborhood chain: go around the room naming Boston-area squares. No repeats, 3 seconds each.',
  "Draw it: one dev has 60 seconds to sketch Joey's route so far from memory. The room votes pass or fail.",
  'Stack attack: name 10 technologies in our project in 30 seconds.',
  'Charades: act out a JumboCode moment (merge conflict, standup, demo day). Guess it in 45 seconds.',
  "Commit haiku: write a 5-7-5 commit message for Joey's last wrong turn. Best one gets read to him.",
  'Jumbo facts: name 5 Tufts buildings that are not dorms in 20 seconds.',
  'Code trivia: the tech lead asks 3 questions about our codebase. Get 2 right.',
];

// ---------------------------------------------------------------- scoring

export const START_TOKENS = 2;
export const START_LIVES = 3;
export const POINTS = {
  dot: 10,
  pellet: 200,
  level: 500,
  gremlin: -300,
  lifeBonus: 500,
  /** Finish under par and earn this per minute saved. */
  perMinuteUnderPar: 40,
};
export const PAR_MINUTES = 60;

// ---------------------------------------------------------------- dots
// A grid of dots over the area. Joey eats the ones he walks past,
// which leaves a trail showing exactly where he has been.

export const DOT_SPACING_M = 60;
export const EAT_RADIUS_M = 38;
export const GRID = {
  south: 42.37,
  north: 42.43,
  west: -71.18,
  east: -71.075,
};

// ---------------------------------------------------------------- GPS hygiene

/** Ignore fixes less accurate than this. */
export const MAX_ACCURACY_M = 80;
/** Ignore fixes that would need him to go faster than this (GPS teleport). 9 m/s is a sprint. */
export const MAX_SPEED_MPS = 9;
/** Segments longer than this are a signal gap: draw them, but do not eat dots along them. */
export const GAP_M = 250;
