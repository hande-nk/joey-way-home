'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, TileLayer } from 'leaflet';
import { useEffect, useRef } from 'react';
import { FINISH, GREMLINS, GREMLIN_RADIUS_M, LEVELS, PELLETS } from '@/lib/config';
import { GRID_COLS, GRID_ROWS, dotCol, dotKey, dotLatLng, dotRow, type Game } from '@/lib/game';
import { distM, formatKm } from '@/lib/geo';
import { CAR, FLAG, GREMLIN_SPRITES, JOEY_FRAMES, drawSprite } from '@/lib/sprites';
import type { LatLng } from '@/lib/types';

/**
 * The game board. Two layers stacked on top of each other:
 *   1. a Leaflet map (satellite photos, or a dark street map)
 *   2. a <canvas> we repaint ~60 times a second with dots, pellets,
 *      gremlins, the trail and pixel Joey.
 * Leaflet only does one job for layer 2: converting lat/lng to screen pixels.
 */

export type Basemap = 'satellite' | 'streets';

type Props = {
  game: Game;
  now: number;
  follow: boolean;
  basemap: Basemap;
  /** Room to leave free on each side for floating panels, in pixels. */
  padding?: { top: number; right: number; bottom: number; left: number };
  onUserPan?: () => void;
  onPick?: (point: LatLng) => void;
  /** Called if satellite tiles fail to load, so the page can switch to streets. */
  onBasemapFailed?: () => void;
};

/*
 * Map tiles.
 * - Satellite: Esri World Imagery, no key needed.
 * - Streets: CARTO Dark Matter when NEXT_PUBLIC_CARTO_KEY is set (CARTO started
 *   requiring a free key in 2026, which is what the "API KEY REQUIRED" watermark was).
 *   Without a key we fall back to plain OpenStreetMap tiles, darkened with CSS.
 */
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY;
export const HAS_CARTO = Boolean(CARTO_KEY);

const TILES = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxNativeZoom: 19,
  },
  satelliteLabels: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: '',
    maxNativeZoom: 19,
  },
  streets: CARTO_KEY
    ? {
        url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxNativeZoom: 20,
        className: 'tiles-carto',
      }
    : {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxNativeZoom: 19,
        className: 'tiles-streets',
      },
};

const LIME = '#d4ff3f';
const RED = '#ff5a4f';
const FONT = '"Inter Variable", Inter, system-ui, sans-serif';
const DEFAULT_PADDING = { top: 90, right: 40, bottom: 90, left: 40 };

export default function ArcadeMap({ game, now, follow, basemap, padding = DEFAULT_PADDING, onUserPan, onPick, onBasemapFailed }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layers = useRef<{ satellite: TileLayer[]; streets: TileLayer[] } | null>(null);

  // The paint loop reads the newest props through this ref, so it never restarts.
  const latest = useRef({ game, now, follow, padding, onUserPan, onPick, onBasemapFailed });
  useEffect(() => {
    latest.current = { game, now, follow, padding, onUserPan, onPick, onBasemapFailed };
  });

  /** Frame the start, home, and wherever Joey is now, clear of the floating panels. */
  const fitCourse = (map: LeafletMap) => {
    const { padding: pad, game } = latest.current;
    const points: LatLng[] = [game.start, FINISH];
    if (game.position) points.push(game.position);
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { paddingTopLeft: [pad.left + 60, pad.top + 60], paddingBottomRight: [pad.right + 60, pad.bottom + 60], animate: false },
    );
  };

  // ---- create the map once
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let map: LeafletMap | null = null;
    let shown: LatLng | null = null; // where Joey is drawn (eases toward his real position)
    const dotLayer = document.createElement('canvas');
    let dotLayerKey = '';
    let lastRefit = 0;

    (async () => {
      const L = (await import('leaflet')).default;
      if (disposed || !mapEl.current) return;

      map = L.map(mapEl.current, {
        zoomControl: false,
        zoomSnap: 0.25,
        minZoom: 12,
        maxZoom: 19,
        zoomAnimation: false,
        fadeAnimation: false,
        inertia: false,
      });
      map.attributionControl.setPrefix(false);

      const sat = L.tileLayer(TILES.satellite.url, { ...TILES.satellite, className: 'tiles-satellite' });
      const satLabels = L.tileLayer(TILES.satelliteLabels.url, { ...TILES.satelliteLabels, className: 'tiles-labels' });
      const streets = L.tileLayer(TILES.streets.url, { ...TILES.streets });
      layers.current = { satellite: [sat, satLabels], streets: [streets] };

      // If satellite tiles keep failing and none load, tell the page so it can fall back.
      let loaded = 0;
      let failed = 0;
      sat.on('tileload', () => loaded++);
      sat.on('tileerror', () => {
        failed++;
        if (failed === 8 && loaded === 0) latest.current.onBasemapFailed?.();
      });

      fitCourse(map);
      map.on('dragstart', () => latest.current.onUserPan?.());
      map.on('click', (e) => latest.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      mapRef.current = map;
      setLayers(basemapRef.current);

      const paint = (ms: number) => {
        frame = requestAnimationFrame(paint);
        const canvas = canvasEl.current;
        if (!canvas || !map) return;
        const { game, now, follow } = latest.current;

        // Ease the drawn position toward the real one so he glides instead of teleporting.
        const target = game.position;
        if (target) {
          if (!shown || distM(shown, target) > 400) shown = { lat: target.lat, lng: target.lng };
          else shown = { lat: shown.lat + (target.lat - shown.lat) * 0.08, lng: shown.lng + (target.lng - shown.lng) * 0.08 };
          if (follow) map.setView([shown.lat, shown.lng], map.getZoom(), { animate: false });
          else if (ms - lastRefit > 1500) {
            // Overview: if Joey wanders out of the clear area, zoom out to keep him in view.
            const pad = latest.current.padding;
            const p = map.latLngToContainerPoint([target.lat, target.lng]);
            const size = map.getSize();
            if (p.x < pad.left + 20 || p.y < pad.top + 20 || p.x > size.x - pad.right - 20 || p.y > size.y - pad.bottom - 20) {
              lastRefit = ms;
              fitCourse(map);
            }
          }
        } else {
          shown = null;
        }

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;

        const theMap = map;
        const toPx = (p: LatLng) => theMap.latLngToContainerPoint([p.lat, p.lng]);
        const zoom = map.getZoom();
        const metersPerPx = (40075016.686 * Math.cos((FINISH.lat * Math.PI) / 180)) / (256 * 2 ** zoom);
        const pulse = (Math.sin(ms / 350) + 1) / 2;
        const offscreen = (p: { x: number; y: number }, margin = 80) =>
          p.x < -margin || p.y < -margin || p.x > width + margin || p.y > height + margin;

        /** A rounded label, like the distance pills on a golf map. */
        const pill = (text: string, x: number, y: number, style: 'light' | 'dark' | 'lime' | 'red' = 'light', size = 11) => {
          ctx.font = `600 ${size}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const w = ctx.measureText(text).width + size * 1.4;
          const h = size + 10;
          ctx.beginPath();
          ctx.roundRect(Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), h, h / 2);
          ctx.fillStyle = { light: 'rgba(255,255,255,0.94)', dark: 'rgba(12,14,12,0.78)', lime: LIME, red: RED }[style];
          ctx.fill();
          ctx.fillStyle = style === 'dark' ? '#f2f4ee' : '#101210';
          ctx.fillText(text, Math.round(x), Math.round(y) + 0.5);
        };

        /** A map pin: a dot on the ground, a short stem, and a round head. Returns the head's center. */
        const pin = (x: number, y: number, head: string, ring: string) => {
          const top = y - 26;
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, top + 13);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, top, 14, 0, Math.PI * 2);
          ctx.fillStyle = head;
          ctx.fill();
          ctx.strokeStyle = ring;
          ctx.lineWidth = 2;
          ctx.stroke();
          return { x, y: top };
        };

        // 1. Dots. Thousands of them, so they are painted onto a hidden canvas and
        //    only repainted when the view or the eaten set changes.
        const center = map.getCenter();
        const dotsKey = [zoom, center.lat.toFixed(6), center.lng.toFixed(6), width, height, dpr, game.eaten.size].join('|');
        if (dotsKey !== dotLayerKey) {
          dotLayerKey = dotsKey;
          dotLayer.width = canvas.width;
          dotLayer.height = canvas.height;
          const dotCtx = dotLayer.getContext('2d');
          if (dotCtx) {
            dotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const bounds = map.getBounds();
            const rowMin = Math.max(0, dotRow(bounds.getSouth()) - 1);
            const rowMax = Math.min(GRID_ROWS, dotRow(bounds.getNorth()) + 1);
            const colMin = Math.max(0, dotCol(bounds.getWest()) - 1);
            const colMax = Math.min(GRID_COLS, dotCol(bounds.getEast()) + 1);
            // x only depends on the column and y on the row, so convert each once.
            const xs: number[] = [];
            const ys: number[] = [];
            for (let c = colMin; c <= colMax; c++) xs.push(toPx(dotLatLng(rowMin, c)).x);
            for (let r = rowMin; r <= rowMax; r++) ys.push(toPx(dotLatLng(r, colMin)).y);
            const size = zoom < 14.5 ? 2 : 3;
            dotCtx.fillStyle = 'rgba(255,255,255,0.42)';
            for (let r = rowMin; r <= rowMax; r++) {
              for (let c = colMin; c <= colMax; c++) {
                if (game.eaten.has(dotKey(r, c))) continue;
                dotCtx.fillRect(Math.round(xs[c - colMin] - size / 2), Math.round(ys[r - rowMin] - size / 2), size, size);
              }
            }
          }
        }
        ctx.drawImage(dotLayer, 0, 0, width, height);

        const home = toPx(FINISH);

        // 2. Only the next level's ring, so the board stays calm.
        const nextLevel = LEVELS[game.level + 1];
        if (game.phase === 'riding' && nextLevel) {
          const radius = (nextLevel.enterKm * 1000) / metersPerPx;
          ctx.setLineDash([6, 8]);
          ctx.strokeStyle = 'rgba(212,255,63,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(home.x, home.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          // Label the ring at its top, away from the distance pill.
          if (home.y - radius > 70) pill(`Level ${game.level + 2}`, home.x, home.y - radius, 'lime', 10);
        }

        // 3. Gremlin zones.
        const zoneRadius = GREMLIN_RADIUS_M / metersPerPx;
        GREMLINS.forEach((gremlin) => {
          const p = toPx(gremlin);
          if (offscreen(p, zoneRadius + 40)) return;
          const caught = game.gremlinsCaught.has(gremlin.id);
          ctx.beginPath();
          ctx.arc(p.x, p.y, zoneRadius, 0, Math.PI * 2);
          ctx.fillStyle = caught ? 'rgba(255,255,255,0.05)' : 'rgba(255,90,79,0.14)';
          ctx.fill();
          ctx.setLineDash([4, 5]);
          ctx.strokeStyle = caught ? 'rgba(255,255,255,0.25)' : 'rgba(255,90,79,0.75)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
          const head = pin(p.x, p.y, 'rgba(14,16,14,0.88)', caught ? 'rgba(255,255,255,0.3)' : RED);
          drawSprite(ctx, GREMLIN_SPRITES[gremlin.kind], head.x, head.y, 1.6, { alpha: caught ? 0.35 : 1 });
          if (zoom >= 13.5) pill(gremlin.name, p.x, p.y + 16, caught ? 'dark' : 'red', 10);
        });

        // 4. A dashed line from Joey to home, with the distance on it.
        if (game.phase === 'riding' && shown) {
          const p = toPx(shown);
          ctx.setLineDash([3, 7]);
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(home.x, home.y);
          ctx.stroke();
          ctx.setLineDash([]);
          if (game.distanceHomeM !== null && Math.hypot(p.x - home.x, p.y - home.y) > 140) {
            pill(`${formatKm(game.distanceHomeM)} to home`, (p.x + home.x) / 2, (p.y + home.y) / 2, 'light', 11);
          }
        }

        // 5. The trail.
        if (game.path.length > 1) {
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          game.path.forEach((fix, i) => {
            const p = toPx(fix);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 7;
          ctx.stroke();
          ctx.strokeStyle = LIME;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // 6. Hint pellets.
        PELLETS.forEach((pellet) => {
          const p = toPx(pellet);
          if (offscreen(p)) return;
          if (game.pelletsCollected.has(pellet.id)) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            return;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9 + pulse * 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(212,255,63,${0.28 - pulse * 0.22})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = LIME;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#101210';
          ctx.fill();
          if (zoom >= 14.25) pill(pellet.name, p.x, p.y - 20, 'light', 10);
        });

        // 7. Start and home.
        const start = toPx(game.start);
        const startHead = pin(start.x, start.y, '#ffffff', 'rgba(0,0,0,0.25)');
        ctx.font = `700 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#101210';
        ctx.fillText('S', startHead.x, startHead.y + 0.5);
        const homeHead = pin(home.x, home.y, LIME, game.phase === 'home' ? '#ffffff' : 'rgba(0,0,0,0.25)');
        drawSprite(ctx, FLAG, homeHead.x + 1, homeHead.y, 2);
        pill(`Home · ${FINISH.name}`, home.x, home.y + 17, 'dark', 11);

        // 8. Joey.
        if (shown && game.position) {
          const p = toPx(shown);
          const scale = follow ? 4 : 3;
          const facingWest = Math.sin((game.headingDeg * Math.PI) / 180) < -0.15;
          const signalAgeS = (now - game.position.t) / 1000;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 13 * scale * 0.7 + pulse * 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(212,255,63,0.16)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(212,255,63,0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (game.phase === 'waiting') {
            if (game.atStart) {
              drawSprite(ctx, JOEY_FRAMES[0], p.x, p.y, scale, { flip: facingWest, outline: 'rgba(0,0,0,0.65)' });
              pill('Joey · at the start', p.x, p.y - 11.5 * scale, 'lime', 11);
            } else {
              drawSprite(ctx, CAR, p.x, p.y, scale, { flip: facingWest, outline: 'rgba(0,0,0,0.65)' });
              pill('Joey · on the way', p.x, p.y - 11 * scale, 'lime', 11);
            }
          } else {
            const moving = signalAgeS < 20 && game.phase === 'riding';
            const frameIndex = moving ? Math.floor(ms / 260) % 2 : 0;
            drawSprite(ctx, JOEY_FRAMES[frameIndex], p.x, p.y, scale, { flip: facingWest, outline: 'rgba(0,0,0,0.65)' });
            pill('Joey', p.x, p.y - 11.5 * scale, 'lime', 11);
            if (signalAgeS > 90 && game.phase === 'riding') pill(`No signal · ${Math.floor(signalAgeS / 60)} min`, p.x, p.y + 11 * scale, 'red', 10);
          }
        }
      };
      frame = requestAnimationFrame(paint);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      map?.remove();
      mapRef.current = null;
      layers.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- basemap switch
  const basemapRef = useRef(basemap);
  function setLayers(which: Basemap) {
    const map = mapRef.current;
    const all = layers.current;
    if (!map || !all) return;
    for (const layer of [...all.satellite, ...all.streets]) layer.remove();
    for (const layer of all[which]) layer.addTo(map);
  }
  useEffect(() => {
    basemapRef.current = basemap;
    setLayers(basemap);
  }, [basemap]);

  // ---- re-frame the course when the host moves the start
  const startKey = `${game.start.lat},${game.start.lng}`;
  useEffect(() => {
    const map = mapRef.current;
    if (map && !latest.current.follow) fitCourse(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey]);

  // ---- camera: follow Joey up close, or show the whole course
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (follow) map.setZoom(16.5, { animate: false });
    else fitCourse(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow]);

  return (
    <div className="board">
      <div ref={mapEl} className="board-map" />
      <canvas ref={canvasEl} className="board-canvas" />
    </div>
  );
}
