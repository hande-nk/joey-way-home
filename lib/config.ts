import type { LatLng } from './types';

/**
 * THE WHOLE GAME IS CONFIGURED HERE.
 * Change the drop-off, the finish, the hints or the scoring in this one file.
 * Nothing else in the app hard-codes a place.
 */

// ---------------------------------------------------------------- course

/** Where the blindfold comes off. Peters Hill summit, Arnold Arboretum. */
export const START: LatLng & { name: string } = {
  name: 'PETERS HILL',
  lat: 42.2935577,
  lng: -71.1272458,
};

/** Finish line. Joyce Cummings Center. Swap the coordinates if you booked another building. */
export const FINISH: LatLng & { name: string } = {
  name: 'JCC',
  lat: 42.4081564,
  lng: -71.1166988,
};

/** He is home when a GPS fix lands this close to FINISH. */
export const FINISH_RADIUS_M = 120;

// ---------------------------------------------------------------- levels
// Levels are rings of straight-line distance to the finish, so they work on
// ANY route he takes. Level i starts once he is within enterKm of home.

export type Level = {
  name: string;
  enterKm: number;
  /** Three hints, read aloud to Joey. Cost: 1, 2, 3 tokens. */
  hints: [riddle: string, landmark: string, direct: string];
};

export const LEVELS: Level[] = [
  {
    name: 'THE ARBORETUM',
    enterKm: Infinity,
    hints: [
      'The city shows its teeth from up here. Home is past the tallest ones, and a little to the left.',
      'Roll downhill toward the skyline and look for a big train station called Forest Hills.',
      'At Forest Hills station, find the bike path that runs beside the Orange Line tracks. Follow it toward downtown.',
    ],
  },
  {
    name: 'THE CORRIDOR',
    enterKm: 11.3,
    hints: [
      'An orange line hides under a green ribbon. Stay on the ribbon until glass towers stand over you.',
      'Keep the Prudential tower ahead of you. The stations you pass should read Green Street, Stony Brook, Jackson Square, Roxbury Crossing, Ruggles.',
      'Stay on the Southwest Corridor path until Massachusetts Avenue station. Then turn left onto Mass Ave.',
    ],
  },
  {
    name: 'BACK BAY',
    enterKm: 8.3,
    hints: [
      'Somewhere close, a bridge is measured in units of one MIT student. Find it.',
      'Massachusetts Avenue is your road. Ride it toward the river, past Symphony Hall and the big church dome.',
      'Take Mass Ave straight across the Harvard Bridge into Cambridge. Stay in the bike lane.',
    ],
  },
  {
    name: 'THE RIVER',
    enterKm: 6.7,
    hints: [
      'Cross the water. Brains to the north, brownstones to the south.',
      'Any bridge works. Get to the Cambridge side, then look for the MIT dome and Mass Ave.',
      'On the Cambridge side, follow Mass Ave away from the river. MIT first, then Central Square.',
    ],
  },
  {
    name: 'CAMBRIDGE',
    enterKm: 5.9,
    hints: [
      'The Red Line is under your wheels. Count the squares like stairs: Central, Harvard, Porter, Davis.',
      'Stay on Mass Ave through Harvard Square and on to Porter Square. Look for a tall red wind sculpture.',
      'From Porter Square, find Elm Street, just off Somerville Ave. It runs straight into Davis Square.',
    ],
  },
  {
    name: 'SOMERVILLE',
    enterKm: 2.9,
    hints: [
      'Two ways home: the avenue named for what you are trying to get back to, or the last stop of the Green Line.',
      'From Davis Square, College Ave heads north to a rotary with an old stone tower in a park.',
      'College Ave all the way. Through the Powder House rotary, past campus, to the corner with Boston Ave.',
    ],
  },
  {
    name: 'HOME STRETCH',
    enterKm: 0.9,
    hints: [
      'You have walked these streets half asleep before a 9 am. Trust your feet.',
      'Find the Green Line station at the end of the line. The finish is right next to it.',
      'Joyce Cummings Center, corner of College Ave and Boston Ave. Come get your snacks.',
    ],
  },
];

export const HINT_TIER_NAMES = ['RIDDLE', 'LANDMARK', 'DIRECT'] as const;

// ---------------------------------------------------------------- power pellets
// Artificial hint pellets placed on real landmarks. Riding through one gives
// +1 hint token, points, and a clue the room may read to Joey.

export type Pellet = LatLng & { id: string; name: string; clue: string; radiusM?: number };

export const PELLET_RADIUS_M = 170;

export const PELLETS: Pellet[] = [
  { id: 'forest-hills', name: 'FOREST HILLS', lat: 42.3008899, lng: -71.1139038, clue: 'End of the Orange Line. A car-free path starts here and shadows the tracks toward downtown.' },
  { id: 'jackson', name: 'JACKSON SQUARE', lat: 42.3232, lng: -71.0998, clue: 'Still on the green ribbon. The towers ahead are getting bigger. Good sign.' },
  { id: 'ruggles', name: 'RUGGLES', lat: 42.3365, lng: -71.089, clue: 'Northeastern is next door. One more station, then a famous avenue crosses your path.' },
  { id: 'symphony', name: 'SYMPHONY HALL', lat: 42.3427, lng: -71.0855, clue: 'You are on Mass Ave. This road passes MIT and Harvard before it gets anywhere near home.' },
  { id: 'harvard-bridge', name: 'THE SMOOT BRIDGE', lat: 42.3547424, lng: -71.0914055, radiusM: 260, clue: '364.4 smoots and one ear. Called the Harvard Bridge, lands at MIT. Keep going straight.' },
  { id: 'bu-bridge', name: 'BU BRIDGE', lat: 42.353, lng: -71.1105, radiusM: 200, clue: 'A different way over the water. On the far side, Central Square is north-east of you.' },
  { id: 'longfellow', name: 'SALT AND PEPPER BRIDGE', lat: 42.3615, lng: -71.076, radiusM: 260, clue: 'The Red Line crosses with you. On the far side, follow it away from Boston.' },
  { id: 'central', name: 'CENTRAL SQUARE', lat: 42.3654, lng: -71.1037, clue: 'First square. Mass Ave keeps climbing the Red Line. Prospect Street cuts north to Somerville.' },
  { id: 'harvard', name: 'HARVARD SQUARE', lat: 42.3734, lng: -71.119, clue: 'Second square. Do not turn toward the river. Mass Ave bends north past the Common.' },
  { id: 'union', name: 'UNION SQUARE', lat: 42.3796, lng: -71.0955, clue: 'You are in Somerville. Home is north-west of here, up and over the hills.' },
  { id: 'porter', name: 'PORTER SQUARE', lat: 42.3884, lng: -71.1191, clue: 'Third square, deepest station on the T. The next square is a short ride north.' },
  { id: 'davis', name: 'DAVIS SQUARE', lat: 42.3967172, lng: -71.1223151, clue: 'You know this place. One avenue from here has the right name.' },
  { id: 'powder-house', name: 'POWDER HOUSE', lat: 42.4011135, lng: -71.116722, clue: 'The stone tower. Last rotary. Pick the exit that goes uphill to campus.' },
];

// ---------------------------------------------------------------- gremlins
// Wrong-turn traps. Ride into a zone and the gremlin catches you:
// lose a life and do the dare (always while stopped, off the bike).

export type GremlinKind = 'goose' | 'cone' | 'truck' | 'pothole' | 'rotary';
export type Gremlin = LatLng & { id: string; kind: GremlinKind; name: string; place: string; dare: string };

export const GREMLIN_RADIUS_M = 350;

export const GREMLINS: Gremlin[] = [
  { id: 'goose', kind: 'goose', name: 'THE GOOSE', place: 'Jamaica Pond', lat: 42.317, lng: -71.12, dare: 'Give us your best goose honk. Loud.' },
  { id: 'cone', kind: 'cone', name: 'CONE ZONE', place: 'Coolidge Corner', lat: 42.342, lng: -71.1212, dare: 'Ten seconds of traffic cop. Direct an imaginary intersection.' },
  { id: 'truck', kind: 'truck', name: 'STORROWED TRUCK', place: 'Downtown', lat: 42.3555, lng: -71.0625, dare: 'Name three teammates and one nice thing about each.' },
  { id: 'pothole', kind: 'pothole', name: 'THE POTHOLE', place: 'Allston', lat: 42.353, lng: -71.132, dare: 'Recite our project tech stack from memory.' },
  { id: 'rotary', kind: 'rotary', name: 'ROTARY OF DOOM', place: 'Sullivan Square', lat: 42.384, lng: -71.077, dare: 'Spin once (off the bike) and point to where you think Tufts is.' },
];

// ---------------------------------------------------------------- lost detection

/** Drift = how much farther from home he is now than his closest approach so far. */
export const DRIFTING_M = 200;
export const LOST_M = 500;
/** He counts as found again once drift is back under this. */
export const FOUND_M = 150;
/** No real progress toward home for this long also counts as lost. */
export const STALL_MS = 8 * 60 * 1000;
export const PROGRESS_STEP_M = 25;

/** When he is lost, the room plays one of these to earn him a free hint token. */
export const ROOM_CHALLENGES: string[] = [
  'NEIGHBORHOOD CHAIN: go around the room naming Boston-area neighborhoods or squares. No repeats, 3 seconds each. Make it all the way around.',
  'DRAW IT: one dev has 60 seconds to sketch Joey\'s route so far from memory. Room votes pass or fail.',
  'STACK ATTACK: name 10 technologies in our project in 30 seconds.',
  'CHARADES: act out a JumboCode moment (merge conflict, standup, demo day). Room guesses in 45 seconds.',
  'COMMIT HAIKU: write a 5-7-5 commit message for Joey\'s last wrong turn. Best one gets read to him.',
  'JUMBO FACTS: name 5 Tufts buildings that are not dorms in 20 seconds.',
  'CODE TRIVIA: the tech lead asks 3 questions about our codebase. Get 2 right.',
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
  perMinuteUnderPar: 20,
};
export const PAR_MINUTES = 120;

// ---------------------------------------------------------------- dots
// A grid of dots over the whole city. Joey eats the ones he rides past,
// which leaves a trail showing exactly where he has been.

export const DOT_SPACING_M = 150;
export const EAT_RADIUS_M = 85;
export const GRID = {
  south: 42.2,
  north: 42.5,
  west: -71.32,
  east: -70.92,
};

// ---------------------------------------------------------------- GPS hygiene

/** Ignore fixes less accurate than this. */
export const MAX_ACCURACY_M = 120;
/** Ignore fixes that would need him to go faster than this (GPS teleport). 20 m/s = 72 km/h. */
export const MAX_SPEED_MPS = 20;
