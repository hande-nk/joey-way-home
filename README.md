# J's Way Home

Live tracker for the JumboCode bonding event. J gets dropped at a mystery spot (default: Spy Pond Park, Arlington) and walks back to the Joyce Cummings Center with no map. The room watches him on a projector: pixel J eats dots across the map, picks up hint pellets, dodges gremlins, and (hopefully) gets home in an hour.
<img width="1510" height="820" alt="PNG image" src="https://github.com/user-attachments/assets/fca46864-0726-47c3-9961-aaeb7d0a177b" />

```bash
npm install
npm run dev
```

Open http://localhost:3000/?demo. A scripted J walks the whole course, takes two wrong turns, gets caught, gets hints, and finishes. No phone, no database, no keys needed. Add `&speed=60` to go faster.

## The three pages

| Page | Who opens it | What it does |
| --- | --- | --- |
| `/` | The projector | The board. Read-only. Keys: `F` follow cam, `M` switch map style. |
| `/control?key=HOST_KEY` | The host's laptop | Move the start, start the game, reveal hints (written or custom), grant tokens, place J by hand, reset. |
| `/rider?key=RIDER_KEY` | J's phone | A "share my location" button. No map, no hints. |

## How it works (the mental model)

```
J's phone ──POST /api/location──▶    ┌──────────────┐
Host laptop ───POST /api/event─────▶ │ Upstash Redis│ ◀──GET /api/state── projector (every 2.5s)
                                     └──────────────┘
```

1. **We store three things**: GPS fixes, host button presses, and the chosen start (`lib/types.ts`).
2. **Everything else is derived.** `computeGame()` in `lib/game.ts` is a pure function that turns those into score, level, lives, "is he lost", and the feed. Nothing like `score` is ever saved, so a refresh, a second screen, or a late joiner always shows the same game. It also makes the logic easy to test (`npm test`).
3. **Polling, not WebSockets.** The projector asks for new fixes every 2.5 seconds. Plain HTTP needs no extra infrastructure on Vercel.
4. **Why a database at all?** Vercel functions are stateless. Two requests can land on two servers that share no memory. Locally, with no Redis configured, `lib/store.ts` falls back to memory.
5. **The board is two layers.** A Leaflet map underneath, and one `<canvas>` on top that we repaint every frame (`components/ArcadeMap.tsx`).

## Deploy to Vercel
(CURRENTLY LIVE)
1. Import the repo on Vercel and deploy. Defaults are fine.
2. **Storage** (or Integrations) > **Upstash for Redis**, free plan, connect it to this project.
3. **Settings > Environment Variables**:
   - `RIDER_KEY`: any long random string (`openssl rand -hex 16`)
   - `HOST_KEY`: a different long random string
   - `NEXT_PUBLIC_CARTO_KEY`: your free key from carto.com/basemaps/apikey (optional, gives the dark street map)
4. **Redeploy** so the variables are picked up.
5. Check: open `/control?key=YOUR_HOST_KEY` and press Reset twice. "Game wiped" means storage and keys work.

The CARTO key is a browser key: anyone who opens the page can see it in network requests. That is normal for map keys. If CARTO lets you restrict the key to a website, restrict it to your Vercel domain.

## Getting J's location in

The `/rider` page.**  Works during FaceTime as long as Safari stays in front (FaceTime shrinks to picture in picture) and the screen stays on.


## Moving the start

On `/control`, under **Start position**: pick a preset or type a name and click "Pick start on map". The start must be within 8 km of the finish and survives a reset. The written hints follow the Spy Pond route, so for other starts use **Custom hint**.

## Changing the game

Everything is in `lib/config.ts`: default `START` and `START_PRESETS`, `FINISH`, the five `LEVELS` with their hints, `PELLETS`, `GREMLINS`, room challenges, scoring, and the "lost" thresholds. Run `npm test` after editing.

## Credits

Map data © OpenStreetMap contributors, © CARTO. Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community. Fonts: Inter, Press Start 2P. All sprites are original.
