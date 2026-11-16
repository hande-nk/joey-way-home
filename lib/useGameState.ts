'use client';

import { useEffect, useRef, useState } from 'react';
import { buildDemo } from './demo';
import type { Fix, HostEvent, RawState } from './types';

const EMPTY: RawState = { gameId: '', track: [], events: [] };
const POLL_MS = 2500;

type ApiState = { gameId: string; from: number; track: Fix[]; total: number; events: HostEvent[]; serverNow: number };

/**
 * Keeps the browser in sync with the server.
 *
 * live: polls GET /api/state every 2.5s and only downloads fixes it has not
 *       seen yet. Polling instead of WebSockets is a deliberate trade-off:
 *       a 2.5s delay is invisible for a bike, and plain HTTP works on Vercel
 *       with zero extra infrastructure.
 * demo: plays a scripted ride locally, sped up.
 */
export function useGameState(mode: 'live' | 'demo' | null, demoSpeed = 30) {
  const [raw, setRaw] = useState<RawState>(EMPTY);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  const local = useRef<RawState>(EMPTY);

  // ---- live mode
  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    let clockOffset = 0;

    async function poll() {
      try {
        const res = await fetch(`/api/state?g=${encodeURIComponent(local.current.gameId)}&n=${local.current.track.length}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`state ${res.status}`);
        const data: ApiState = await res.json();
        if (cancelled) return;
        clockOffset = data.serverNow - Date.now();

        const prev = local.current;
        const sameGame = data.gameId === prev.gameId;
        let track = prev.track;
        if (!sameGame || data.from === 0) track = data.track;
        else if (data.from === prev.track.length) track = data.track.length ? [...prev.track, ...data.track] : prev.track;
        else track = []; // out of sync: next poll refetches everything

        const eventsChanged =
          data.events.length !== prev.events.length || data.events.at(-1)?.id !== prev.events.at(-1)?.id;
        if (!sameGame || track !== prev.track || eventsChanged) {
          local.current = { gameId: data.gameId, track, events: data.events };
          setRaw(local.current);
        }
        setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    poll();
    const pollTimer = setInterval(poll, POLL_MS);
    const clockTimer = setInterval(() => setNow(Date.now() + clockOffset), 1000);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [mode]);

  // ---- demo mode
  useEffect(() => {
    if (mode !== 'demo') return;
    const wallStart = Date.now();
    const demo = buildDemo(wallStart);
    let shown = -1;
    const timer = setInterval(() => {
      const virtualNow = wallStart + (Date.now() - wallStart) * demoSpeed;
      let count = Math.max(shown, 0);
      while (count < demo.track.length && demo.track[count].t <= virtualNow) count++;
      const events = demo.events.filter((e) => e.t <= virtualNow);
      if (count !== shown || events.length !== local.current.events.length) {
        shown = count;
        local.current = { gameId: 'demo', track: demo.track.slice(0, count), events };
        setRaw(local.current);
      }
      setNow(virtualNow);
    }, 200);
    return () => clearInterval(timer);
  }, [mode, demoSpeed]);

  return { raw, now, online };
}

/** POST helper used by /rider and /control. */
export async function postJson(path: string, key: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-game-key': key },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}
