'use client';

import { useEffect, useRef } from 'react';
import { FINISH, GREMLINS, LEVELS, PELLETS, START } from '@/lib/config';
import type { Game } from '@/lib/game';
import type { LatLng } from '@/lib/types';

/** Mini-map of the whole course. Always shows the big picture, even when the main map follows Joey. */

const BOX = { south: 42.28, north: 42.425, west: -71.165, east: -71.045 };
const WIDTH = 150;
const HEIGHT = 240;

export default function Radar({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const px = (p: LatLng) => ({
      x: ((p.lng - BOX.west) / (BOX.east - BOX.west)) * WIDTH,
      y: HEIGHT - ((p.lat - BOX.south) / (BOX.north - BOX.south)) * HEIGHT,
    });
    const pxPerKm = HEIGHT / ((BOX.north - BOX.south) * 111.32);

    const home = px(FINISH);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    LEVELS.forEach((level, i) => {
      if (!Number.isFinite(level.enterKm)) return;
      ctx.strokeStyle = i <= game.maxLevel && game.phase !== 'waiting' ? 'rgba(77,255,136,0.6)' : 'rgba(95,232,255,0.35)';
      ctx.beginPath();
      ctx.arc(home.x, home.y, level.enterKm * pxPerKm, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    PELLETS.forEach((pellet) => {
      const p = px(pellet);
      ctx.fillStyle = game.pelletsCollected.has(pellet.id) ? 'rgba(255,122,217,0.25)' : '#ff7ad9';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    GREMLINS.forEach((gremlin) => {
      const p = px(gremlin);
      ctx.fillStyle = game.gremlinsCaught.has(gremlin.id) ? '#5a6082' : '#ff3b3b';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    });

    if (game.path.length > 1) {
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      game.path.forEach((fix, i) => {
        const p = px(fix);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    const start = px(START);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(start.x - 2.5, start.y - 2.5, 5, 5);
    ctx.fillStyle = '#4dff88';
    ctx.fillRect(home.x - 3.5, home.y - 3.5, 7, 7);

    if (game.position) {
      const p = px(game.position);
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      ctx.fillStyle = '#05050f';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
  }, [game]);

  return <canvas ref={ref} className="radar" style={{ width: WIDTH, height: HEIGHT }} aria-label="Course overview" />;
}
