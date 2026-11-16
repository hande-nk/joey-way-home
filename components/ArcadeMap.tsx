'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, TileLayer } from 'leaflet';
import { useEffect, useRef } from 'react';
import { FINISH, GREMLINS, GREMLIN_RADIUS_M, LEVELS, PELLETS, START } from '@/lib/config';
import { GRID_COLS, GRID_ROWS, dotCol, dotKey, dotLatLng, dotRow, type Game } from '@/lib/game';
import { distM } from '@/lib/geo';
import { CAR, ELEPHANT, FLAG, GREMLIN_SPRITES, JOEY_FRAMES, drawSprite } from '@/lib/sprites';
import type { LatLng } from '@/lib/types';

/**
 * The game board. Two layers stacked on top of each other:
 *   1. a Leaflet map (real streets, tinted arcade blue by CSS)
 *   2. a <canvas> we repaint ~60 times a second with dots, pellets,
 *      gremlins, the trail and pixel Joey.
 * Leaflet only does one job for layer 2: converting lat/lng to screen pixels.
 */

type Props = {
  game: Game;
  now: number;
  follow: boolean;
  showTiles: boolean;
  onUserPan?: () => void;
  onPick?: (point: LatLng) => void;
};

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const FONT = '"Press Start 2P", monospace';

export default function ArcadeMap({ game, now, follow, showTiles, onUserPan, onPick }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tilesRef = useRef<TileLayer | null>(null);

  // The paint loop reads the newest props through this ref, so it never restarts.
  const latest = useRef({ game, now, follow, onUserPan, onPick });
  useEffect(() => {
    latest.current = { game, now, follow, onUserPan, onPick };
  });

  // ---- create the map once
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let map: LeafletMap | null = null;
    let shown: LatLng | null = null; // where Joey is drawn (eases toward his real position)
    const dotLayer = document.createElement('canvas');
    let dotLayerKey = '';

    (async () => {
      const L = (await import('leaflet')).default;
      if (disposed || !mapEl.current) return;

      map = L.map(mapEl.current, {
        zoomControl: false,
        zoomSnap: 0.25,
        minZoom: 11,
        maxZoom: 18,
        zoomAnimation: false,
        fadeAnimation: false,
        inertia: false,
      });
      map.attributionControl.setPrefix(false);
      tilesRef.current = L.tileLayer(TILE_URL, {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: TILE_ATTRIBUTION,
        className: 'arcade-tiles',
      }).addTo(map);
      map.fitBounds(
        [
          [START.lat, START.lng],
          [FINISH.lat, FINISH.lng],
        ],
        { padding: [70, 70] },
      );
      map.on('dragstart', () => latest.current.onUserPan?.());
      map.on('click', (e) => latest.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      mapRef.current = map;

      const paint = (ms: number) => {
        frame = requestAnimationFrame(paint);
        const canvas = canvasEl.current;
        if (!canvas || !map) return;

        const { game, now, follow } = latest.current;

        // Ease the drawn position toward the real one so he glides instead of teleporting.
        const target = game.position;
        if (target) {
          if (!shown || distM(shown, target) > 600) shown = { lat: target.lat, lng: target.lng };
          else {
            shown = {
              lat: shown.lat + (target.lat - shown.lat) * 0.08,
              lng: shown.lng + (target.lng - shown.lng) * 0.08,
            };
          }
          if (follow) map.setView([shown.lat, shown.lng], map.getZoom(), { animate: false });
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
        const blinkOn = Math.floor(ms / 300) % 2 === 0;

        const label = (text: string, x: number, y: number, color: string, size = 8) => {
          ctx.font = `${size}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(5,5,15,0.85)';
          const w = ctx.measureText(text).width + 8;
          ctx.fillRect(x - w / 2, y - size - 3, w, size + 7);
          ctx.fillStyle = color;
          ctx.fillText(text, x, y);
        };

        // 1. Dots. Thousands of them, so we paint them onto a hidden canvas and only
        //    repaint that when the view or the eaten set changes.
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
            const dotSize = zoom < 13 ? 2 : zoom < 15 ? 3 : 4;
            dotCtx.fillStyle = '#ffb8ae';
            for (let r = rowMin; r <= rowMax; r++) {
              for (let c = colMin; c <= colMax; c++) {
                if (game.eaten.has(dotKey(r, c))) continue;
                dotCtx.fillRect(Math.round(xs[c - colMin] - dotSize / 2), Math.round(ys[r - rowMin] - dotSize / 2), dotSize, dotSize);
              }
            }
          }
        }
        ctx.drawImage(dotLayer, 0, 0, width, height);

        // 2. Level rings around home.
        const home = toPx(FINISH);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 8]);
        LEVELS.forEach((level, i) => {
          if (!Number.isFinite(level.enterKm)) return;
          const radius = (level.enterKm * 1000) / metersPerPx;
          ctx.strokeStyle = i <= game.maxLevel && game.phase !== 'waiting' ? 'rgba(77,255,136,0.5)' : 'rgba(95,232,255,0.35)';
          ctx.beginPath();
          ctx.arc(home.x, home.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          label(`LV${i + 1}`, home.x + radius * 0.5, home.y + radius * 0.866 + 4, 'rgba(95,232,255,0.8)', 7);
        });
        ctx.setLineDash([]);

        // 3. Gremlin zones.
        const zoneRadius = GREMLIN_RADIUS_M / metersPerPx;
        GREMLINS.forEach((gremlin, i) => {
          const p = toPx(gremlin);
          if (p.x < -200 || p.y < -200 || p.x > width + 200 || p.y > height + 200) return;
          const caught = game.gremlinsCaught.has(gremlin.id);
          ctx.beginPath();
          ctx.arc(p.x, p.y, zoneRadius, 0, Math.PI * 2);
          ctx.fillStyle = caught ? 'rgba(90,96,130,0.12)' : 'rgba(255,59,59,0.10)';
          ctx.fill();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = caught ? 'rgba(90,96,130,0.6)' : 'rgba(255,59,59,0.7)';
          ctx.stroke();
          ctx.setLineDash([]);
          const wanderX = caught ? 0 : Math.cos(ms / 1400 + i * 1.7) * zoneRadius * 0.35;
          const wanderY = caught ? 0 : Math.sin(ms / 900 + i * 2.3) * zoneRadius * 0.25;
          const scale = zoom < 13 ? 2 : 3;
          drawSprite(ctx, GREMLIN_SPRITES[gremlin.kind], p.x + wanderX, p.y + wanderY, scale, { alpha: caught ? 0.35 : 1 });
          if (zoom >= 12.5) label(gremlin.name, p.x, p.y + zoneRadius + 12, caught ? '#5a6082' : '#ff3b3b', 7);
        });

        // 4. The trail.
        if (game.path.length > 1) {
          ctx.beginPath();
          game.path.forEach((fix, i) => {
            const p = toPx(fix);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(255,230,0,0.22)';
          ctx.lineWidth = 9;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,230,0,0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // 5. Power pellets.
        PELLETS.forEach((pellet) => {
          const p = toPx(pellet);
          if (p.x < -50 || p.y < -50 || p.x > width + 50 || p.y > height + 50) return;
          if (game.pelletsCollected.has(pellet.id)) {
            ctx.strokeStyle = 'rgba(255,122,217,0.35)';
            ctx.lineWidth = 1;
            ctx.strokeRect(p.x - 3, p.y - 3, 6, 6);
            return;
          }
          const size = blinkOn ? 12 : 8;
          ctx.fillStyle = '#ff7ad9';
          ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 2), 4, 4);
          if (zoom >= 13.5) label(pellet.name, p.x, p.y - 12, '#ff7ad9', 7);
        });

        // 6. Start flag and home.
        const start = toPx(START);
        drawSprite(ctx, FLAG, start.x + 8, start.y - 12, 3);
        label('START', start.x, start.y + 18, '#ffffff', 7);
        const bounce = game.phase === 'home' ? Math.abs(Math.sin(ms / 150)) * 10 : Math.abs(Math.sin(ms / 500)) * 3;
        drawSprite(ctx, ELEPHANT, home.x, home.y - 6 - bounce, 3);
        label('HOME', home.x, home.y + 26, '#4dff88', 8);

        // 7. Joey.
        if (shown && game.position) {
          const p = toPx(shown);
          const scale = follow ? 4 : 3;
          const facingWest = Math.sin((game.headingDeg * Math.PI) / 180) < -0.15;
          const signalAgeS = (now - game.position.t) / 1000;
          if (game.phase === 'waiting') {
            drawSprite(ctx, CAR, p.x, p.y, scale, { flip: facingWest });
            label('JOEY (BLINDFOLDED)', p.x, p.y - 8 * scale, '#ffe600', 7);
          } else {
            const moving = signalAgeS < 20 && game.phase === 'riding';
            const frameIndex = moving ? Math.floor(ms / 140) % 2 : 0;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 9 * scale + Math.sin(ms / 200) * 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,230,0,0.14)';
            ctx.fill();
            drawSprite(ctx, JOEY_FRAMES[frameIndex], p.x, p.y, scale, { flip: facingWest });
            label('JOEY', p.x, p.y - 9 * scale, '#ffe600', 8);
            if (signalAgeS > 90 && game.phase === 'riding' && blinkOn) label('NO SIGNAL', p.x, p.y + 10 * scale + 10, '#ff3b3b', 8);
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
    };
  }, []);

  // ---- camera: follow Joey up close, or show the whole course
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (follow) {
      map.setZoom(15.5, { animate: false });
    } else {
      const points: [number, number][] = [
        [START.lat, START.lng],
        [FINISH.lat, FINISH.lng],
      ];
      map.fitBounds(points, { padding: [70, 70], animate: false });
    }
  }, [follow]);

  // ---- street map on or off (off = pure black arcade board)
  useEffect(() => {
    tilesRef.current?.setOpacity(showTiles ? 1 : 0);
  }, [showTiles]);

  return (
    <div className="board">
      <div ref={mapEl} className="board-map" />
      <canvas ref={canvasEl} className="board-canvas" />
    </div>
  );
}
