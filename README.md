# Joey's Way Home

Arcade-style live tracker for the JumboCode bonding event. Joey gets dropped at a mystery spot with a bike and no map. The room watches him ride home on a projector: pixel Joey eats dots across a real map of Boston, picks up hint pellets, dodges gremlins, and (hopefully) reaches the finish.

> **Keep this repo private and do not send Joey the link.** The drop-off, the hints and the traps are all in `lib/config.ts`.

## Try it in 30 seconds

```bash
npm install
npm run dev
```

Open http://localhost:3000/?demo. A scripted Joey rides the whole course, takes two wrong turns, gets caught, gets hints, and finishes. No phone, no database, no keys needed. Add `&speed=60` to go faster.

## The three pages

| Page | Who opens it | What it does |
| --- | --- | --- |
| `/` | The projector | The game board. Read-only. Keys: `F` follow cam, `M` street map on/off. |
| `/control?key=HOST_KEY` | The host's laptop | Start, reveal hints, grant tokens, place Joey by hand, reset. |
| `/rider?key=RIDER_KEY` | Joey's phone | A "share my location" button. No map, no hints. |

## How it works (the mental model)

```
Joey's phone ──POST /api/location──▶ ┌──────────────┐
Host laptop ───POST /api/event─────▶ │ Upstash Redis │ ◀──GET /api/state── projector (every 2.5s)
                                     └──────────────┘
```

1. **We only store two lists**: GPS fixes and host button presses (`lib/types.ts`).
2. **Everything else is derived.** `computeGame()` in `lib/game.ts` is a pure function that turns those two lists into score, level, lives, "is he lost", and the feed. Nothing like `score` is ever saved. That is why a refresh, a second screen, or a late joiner always shows the same game. It also makes the logic easy to test (`npm test`).
3. **Polling, not WebSockets.** The projector asks for new fixes every 2.5 seconds. A bike does not move far in 2.5 seconds, and plain HTTP needs no extra infrastructure on Vercel.
4. **Why a database at all?** Vercel functions are stateless. Two requests can land on two different servers that share no memory, so the track has to live somewhere outside them. Locally, with no Redis configured, `lib/store.ts` falls back to memory.
5. **The board is two layers.** A Leaflet street map underneath, and one `<canvas>` on top that we repaint every frame (`components/ArcadeMap.tsx`). Leaflet's only job for the canvas is converting lat/lng to pixels.

```
app/
  page.tsx            big screen
  control/page.tsx    host remote
  rider/page.tsx      Joey's beacon
  api/state           GET  game state (public)
  api/location        POST a GPS fix (rider or host key)
  api/event           POST start / hint / token / finish / reset (host key)
components/           ArcadeMap, Radar, PixelSprite
lib/
  config.ts           THE GAME: course, levels, hints, pellets, gremlins, scoring
  game.ts             computeGame(): raw data in, full game out
  store.ts            Redis (or memory) read/write
  auth.ts             RIDER_KEY / HOST_KEY check
  sprites.ts          pixel art as text
  demo.ts             the scripted demo ride
```

## Deploy to Vercel

1. Push this repo to GitHub (private).
2. On vercel.com: **Add New > Project**, import the repo, deploy. Defaults are fine.
3. In the project: **Storage > Create Database > Upstash (Redis)**, free plan, connect it to this project. That adds the Redis env vars for you.
4. **Settings > Environment Variables**, add two secrets (any long random strings):
   - `RIDER_KEY`
   - `HOST_KEY`
5. **Redeploy** so the new env vars are picked up.
6. Check: open `/?demo` (works without any of the above), then `/control?key=YOUR_HOST_KEY` and press Reset. If Reset says "GAME WIPED", storage and keys are working.

Without `RIDER_KEY`/`HOST_KEY` the production API refuses all writes on purpose.

## Getting Joey's location in

Three options. Pick one as the plan and keep another as backup.

**A. OwnTracks app (recommended).** Free on iOS and Android, and it keeps sending while the phone is locked or on a FaceTime call. In the app's connection settings choose **HTTP** mode and set the URL to:

```
https://YOUR-APP.vercel.app/api/location?key=YOUR_RIDER_KEY
```

Set its monitoring mode to **Move** so it reports every few seconds, and allow location "Always".

**B. The `/rider` page.** Zero install, but phone browsers stop sending GPS when the tab is in the background or the screen locks. Only good if a second phone on the handlebars runs it with the screen on.

**C. By hand.** Joey shares his location with the host (Find My or Google Maps). On `/control`, press "Place Joey by hand" and click the map where he is. Ugly but unbreakable.

Whatever you pick, **do a 10-minute test ride around campus the day before** with the real phone, the real mount, and FaceTime running.

## Event-day checklist

- [ ] `/control`: press **Reset game** (clears test data)
- [ ] Projector on `/`, sound on, browser zoom so the board fills the screen
- [ ] Joey's beacon is on before he gets in the Uber (the room sees a pixel car)
- [ ] At the drop: blindfold off, host presses **Start**. The clock runs and dots start counting.
- [ ] During the ride: reveal hints and grant tokens from `/control`
- [ ] If GPS misses the finish line, press **Finish by hand**

## Changing the game

Everything is in `lib/config.ts`: `START`, `FINISH`, the seven `LEVELS` with their hints, `PELLETS`, `GREMLINS`, room challenges, scoring, and thresholds for "lost". Run `npm test` after editing. The tests replay the demo ride and catch a broken config.

If the street map looks too dark or too bright on your projector, tweak `--tile-filter` at the top of `app/globals.css`.

## Credits

Map data © OpenStreetMap contributors, tiles © CARTO. Font: Press Start 2P. All sprites are original.
