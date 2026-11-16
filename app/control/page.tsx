'use client';

import { useEffect, useMemo, useState } from 'react';
import ArcadeMap from '@/components/ArcadeMap';
import { GREMLINS, HINT_TIER_NAMES, LEVELS } from '@/lib/config';
import { computeGame } from '@/lib/game';
import { formatClock, formatKm } from '@/lib/geo';
import { postJson, useGameState } from '@/lib/useGameState';
import type { LatLng } from '@/lib/types';

/**
 * Host remote control. Open on your laptop (NOT the projector): /control?key=HOST_KEY
 * Every button here just POSTs an event. The big screen picks it up on its next poll.
 */

export default function ControlPage() {
  const [key, setKey] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [hintLevel, setHintLevel] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('key');
    const saved = window.localStorage.getItem('jwh-host-key');
    if (fromUrl) {
      setKey(fromUrl);
      window.localStorage.setItem('jwh-host-key', fromUrl);
    } else if (saved) {
      setKey(saved);
    }
  }, []);

  const { raw, now, online } = useGameState('live');
  const game = useMemo(() => computeGame(raw, now), [raw, now]);

  async function send(path: string, body: unknown, done: string) {
    const result = await postJson(path, key, body);
    setMessage(result.ok ? done : `ERROR: ${result.error}`);
  }

  /** Dangerous buttons need two clicks: the first arms, the second fires. */
  function twoStep(id: string, action: () => void) {
    if (armed === id) {
      setArmed(null);
      action();
    } else {
      setArmed(id);
      setTimeout(() => setArmed((current) => (current === id ? null : current)), 4000);
    }
  }

  function place(point: LatLng) {
    if (!placing) return;
    void send('/api/location', { ...point, t: Date.now(), acc: 30 }, 'JOEY PLACED BY HAND');
  }

  const levelIndex = hintLevel ?? game.level;
  const level = LEVELS[levelIndex];
  const riding = game.phase === 'riding';
  const lastDare = [...game.log].reverse().find((entry) => entry.kind === 'gremlin');
  const caughtNames = GREMLINS.filter((g) => game.gremlinsCaught.has(g.id)).map((g) => g.name);

  return (
    <main className="control">
      <section className="control-left">
        <h1 className="logo">HOST CONTROL</h1>
        <label className="field">
          <span>HOST KEY</span>
          <input
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              window.localStorage.setItem('jwh-host-key', e.target.value);
            }}
            type="password"
            autoComplete="off"
          />
        </label>

        <div className="panel">
          <p className="panel-label">NOW {online ? '' : '· OFFLINE'}</p>
          <p className="status-text">{game.status}</p>
          <p className="status-sub">
            LEVEL {game.level + 1} {LEVELS[game.level].name} · {game.distanceHomeM === null ? '--' : formatKm(game.distanceHomeM)} TO HOME
          </p>
          <p className="status-sub">
            TIME {formatClock(game.elapsedMs)} · SCORE {game.score} · TOKENS {game.tokens} · LIVES {game.lives}
          </p>
          <p className="status-sub">
            FIXES {raw.track.length}
            {game.position ? ` · LAST ${Math.max(0, Math.round((now - game.position.t) / 1000))}S AGO` : ' · NO SIGNAL YET'}
          </p>
          {caughtNames.length ? <p className="status-sub red">CAUGHT BY: {caughtNames.join(', ')}</p> : null}
          {lastDare?.sub ? <p className="status-sub">{lastDare.sub}</p> : null}
        </div>

        <div className="panel">
          <p className="panel-label">1. GAME</p>
          <button type="button" className="ctl go" disabled={!key} onClick={() => twoStep('start', () => void send('/api/event', { type: 'start' }, 'STARTED'))}>
            {armed === 'start' ? 'CLICK AGAIN: BLINDFOLD OFF' : game.startedAt ? 'RESTART CLOCK' : 'START (BLINDFOLD OFF)'}
          </button>
          <button type="button" className="ctl" disabled={!key || !riding} onClick={() => twoStep('finish', () => void send('/api/event', { type: 'finish' }, 'FINISHED'))}>
            {armed === 'finish' ? 'CLICK AGAIN: HE IS HOME' : 'FINISH BY HAND'}
          </button>
          <button type="button" className="ctl stop" disabled={!key} onClick={() => twoStep('reset', () => void send('/api/event', { type: 'reset' }, 'GAME WIPED'))}>
            {armed === 'reset' ? 'CLICK AGAIN: WIPE EVERYTHING' : 'RESET GAME'}
          </button>
        </div>

        <div className="panel">
          <p className="panel-label">2. HINTS · {game.tokens} TOKENS</p>
          <label className="field inline">
            <span>FOR LEVEL</span>
            <select value={levelIndex} onChange={(e) => setHintLevel(Number(e.target.value))}>
              {LEVELS.map((l, i) => (
                <option key={l.name} value={i}>
                  {i + 1}. {l.name}
                  {i === game.level ? ' (CURRENT)' : ''}
                </option>
              ))}
            </select>
          </label>
          {level.hints.map((text, i) => {
            const tier = (i + 1) as 1 | 2 | 3;
            return (
              <button
                type="button"
                key={text}
                className="ctl hint"
                disabled={!key || !riding || game.tokens < tier}
                onClick={() => twoStep(`hint-${tier}`, () => void send('/api/event', { type: 'hint', level: levelIndex, tier }, `HINT ${tier} REVEALED`))}
              >
                <strong>
                  {armed === `hint-${tier}` ? 'CLICK AGAIN TO REVEAL' : `${HINT_TIER_NAMES[i]} · COSTS ${tier}`}
                </strong>
                <span>{text}</span>
              </button>
            );
          })}
          <button type="button" className="ctl" disabled={!key || !riding} onClick={() => void send('/api/event', { type: 'token' }, '+1 TOKEN')}>
            ROOM WON A CHALLENGE: +1 TOKEN
          </button>
          {game.activeChallenge ? <p className="status-sub">CHALLENGE ON SCREEN: {game.activeChallenge}</p> : null}
        </div>

        <div className="panel">
          <p className="panel-label">3. GPS BACKUP</p>
          <button type="button" className={`ctl ${placing ? 'go' : ''}`} disabled={!key} onClick={() => setPlacing((v) => !v)} aria-pressed={placing}>
            {placing ? 'PLACING: CLICK THE MAP' : 'PLACE JOEY BY HAND'}
          </button>
          <p className="status-sub">If his beacon dies, open his shared location on your phone and click that spot on the map.</p>
        </div>

        {message ? <p className={`toast ${message.startsWith('ERROR') ? 'red' : 'green'}`}>{message}</p> : null}
      </section>

      <section className="control-map">
        <ArcadeMap game={game} now={now} follow={false} showTiles onPick={place} />
      </section>
    </main>
  );
}
