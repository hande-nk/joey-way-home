'use client';

import { useEffect, useMemo, useState } from 'react';
import ArcadeMap, { HAS_CARTO, type Basemap } from '@/components/ArcadeMap';
import { FINISH, GREMLINS, HINT_TIER_NAMES, LEVELS, START_PRESETS } from '@/lib/config';
import { computeGame } from '@/lib/game';
import { formatClock, formatKm } from '@/lib/geo';
import { postJson, useGameState } from '@/lib/useGameState';
import type { LatLng } from '@/lib/types';

/**
 * Host remote control. Open on your laptop (NOT the projector): /control?key=HOST_KEY
 * Every button here just POSTs an event. The big screen picks it up on its next poll.
 */

const STATUS_LABEL = { WAITING: 'Waiting', 'ON TRACK': 'On track', DRIFTING: 'Drifting', LOST: 'Lost', HOME: 'Home' } as const;

export default function ControlPage() {
  const [key, setKey] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>(HAS_CARTO ? 'streets' : 'satellite');
  /** What a click on the map does: nothing, place Joey, or move the start. */
  const [pickMode, setPickMode] = useState<'none' | 'joey' | 'start'>('none');
  const [startName, setStartName] = useState('');
  const [customHint, setCustomHint] = useState('');
  const [customCost, setCustomCost] = useState<1 | 2 | 3>(1);

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
    setMessage(result.ok ? done : `Error: ${result.error}`);
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

  function setStart(point: LatLng & { name?: string }) {
    const name = point.name ?? (startName.trim() || 'Custom start');
    void send('/api/event', { type: 'course', lat: point.lat, lng: point.lng, name }, `Start moved to ${name}`);
  }

  function onMapClick(point: LatLng) {
    if (pickMode === 'joey') void send('/api/location', { ...point, t: Date.now(), acc: 30 }, 'Joey placed by hand');
    if (pickMode === 'start') {
      setStart(point);
      setPickMode('none');
    }
  }

  const levelIndex = hintLevel ?? game.level;
  const level = LEVELS[levelIndex];
  const riding = game.phase === 'riding';
  const lastDare = [...game.log].reverse().find((entry) => entry.kind === 'gremlin');
  const caughtNames = GREMLINS.filter((g) => game.gremlinsCaught.has(g.id)).map((g) => g.name);

  return (
    <main className="control">
      <section className="control-left">
        <h1 className="page-title">Host control</h1>
        <label className="field">
          <span>Host key</span>
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

        <div className="card">
          <div className="card-head">
            <span className="card-label">Right now</span>
            {!online ? <span className="chip chip-red">Offline</span> : null}
          </div>
          <p className="status-text">{STATUS_LABEL[game.status]}</p>
          <p className="sub">
            Level {game.level + 1} · {LEVELS[game.level].name} · {game.distanceHomeM === null ? '--' : formatKm(game.distanceHomeM)} to home
          </p>
          <p className="sub">
            {formatClock(game.elapsedMs)} · score {game.score} · {game.tokens} tokens · {game.lives} lives
          </p>
          <p className="sub">
            {raw.track.length} GPS fixes
            {game.position ? ` · last one ${Math.max(0, Math.round((now - game.position.t) / 1000))}s ago` : ' · no signal yet'}
          </p>
          {game.phase === 'waiting' && game.atStart ? <p className="sub lime">Joey is at the start line. Press Start when the blindfold comes off.</p> : null}
          {caughtNames.length ? <p className="sub red">Caught by: {caughtNames.join(', ')}</p> : null}
          {lastDare?.sub ? <p className="sub">{lastDare.sub}</p> : null}
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-label">1. Start position</span>
            <span className="chip">{game.start.name}</span>
          </div>
          {START_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.name}
              className={`ctl ${game.start.lat === preset.lat && game.start.lng === preset.lng ? 'go' : ''}`}
              disabled={!key}
              onClick={() => setStart(preset)}
            >
              {preset.name}
            </button>
          ))}
          <label className="field" style={{ marginTop: 12 }}>
            <span>Or name a custom spot, then click it on the map</span>
            <input value={startName} onChange={(e) => setStartName(e.target.value)} placeholder="e.g. Robbins Library" maxLength={40} />
          </label>
          <button
            type="button"
            className={`ctl ${pickMode === 'start' ? 'armed' : ''}`}
            disabled={!key}
            onClick={() => setPickMode((m) => (m === 'start' ? 'none' : 'start'))}
            aria-pressed={pickMode === 'start'}
          >
            {pickMode === 'start' ? 'Click the map to set the start' : 'Pick start on map'}
          </button>
          <p className="sub">Must be within 8 km of {FINISH.name}. Survives a reset. The written hints follow the Spy Pond route, so use custom hints for other starts.</p>
        </div>

        <div className="card">
          <span className="card-label">2. Game</span>
          <button
            type="button"
            className={`ctl ${armed === 'start' ? 'armed' : 'go'}`}
            disabled={!key}
            onClick={() => twoStep('start', () => void send('/api/event', { type: 'start' }, 'Started'))}
          >
            {armed === 'start' ? 'Click again: blindfold off' : game.startedAt ? 'Restart clock' : 'Start (blindfold off)'}
          </button>
          <button
            type="button"
            className={`ctl ${armed === 'finish' ? 'armed' : ''}`}
            disabled={!key || !riding}
            onClick={() => twoStep('finish', () => void send('/api/event', { type: 'finish' }, 'Finished'))}
          >
            {armed === 'finish' ? 'Click again: he is home' : 'Finish by hand'}
          </button>
          <button
            type="button"
            className={`ctl ${armed === 'reset' ? 'armed' : 'stop'}`}
            disabled={!key}
            onClick={() => twoStep('reset', () => void send('/api/event', { type: 'reset' }, 'Game wiped'))}
          >
            {armed === 'reset' ? 'Click again: wipe everything' : 'Reset game'}
          </button>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-label">3. Hints</span>
            <span className="chip chip-lime">{game.tokens} tokens</span>
          </div>
          <label className="field inline">
            <span>For level</span>
            <select value={levelIndex} onChange={(e) => setHintLevel(Number(e.target.value))}>
              {LEVELS.map((l, i) => (
                <option key={l.name} value={i}>
                  {i + 1}. {l.name}
                  {i === game.level ? ' (current)' : ''}
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
                className={`ctl hint ${armed === `hint-${tier}` ? 'armed' : ''}`}
                disabled={!key || !riding || game.tokens < tier}
                onClick={() => twoStep(`hint-${tier}`, () => void send('/api/event', { type: 'hint', level: levelIndex, tier }, `Hint ${tier} revealed`))}
              >
                <strong>{armed === `hint-${tier}` ? 'Click again to reveal' : `${HINT_TIER_NAMES[i]} · costs ${tier}`}</strong>
                <span>{text}</span>
              </button>
            );
          })}
          <label className="field" style={{ marginTop: 12 }}>
            <span>Custom hint</span>
            <input value={customHint} onChange={(e) => setCustomHint(e.target.value)} placeholder="Type your own hint" maxLength={300} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="ctl" style={{ width: 'auto' }} value={customCost} onChange={(e) => setCustomCost(Number(e.target.value) as 1 | 2 | 3)} aria-label="Hint cost">
              <option value={1}>Costs 1</option>
              <option value={2}>Costs 2</option>
              <option value={3}>Costs 3</option>
            </select>
            <button
              type="button"
              className={`ctl ${armed === 'custom' ? 'armed' : ''}`}
              disabled={!key || !riding || !customHint.trim() || game.tokens < customCost}
              onClick={() =>
                twoStep('custom', () => {
                  void send('/api/event', { type: 'hint', level: game.level, tier: customCost, text: customHint }, 'Custom hint revealed');
                  setCustomHint('');
                })
              }
            >
              {armed === 'custom' ? 'Click again to reveal' : 'Reveal custom hint'}
            </button>
          </div>
          <button type="button" className="ctl" disabled={!key || !riding} onClick={() => void send('/api/event', { type: 'token' }, '+1 token')}>
            Room won a challenge: +1 token
          </button>
          {game.activeChallenge ? <p className="sub">On screen: {game.activeChallenge}</p> : null}
        </div>

        <div className="card">
          <span className="card-label">4. GPS backup</span>
          <button
            type="button"
            className={`ctl ${pickMode === 'joey' ? 'armed' : ''}`}
            disabled={!key}
            onClick={() => setPickMode((m) => (m === 'joey' ? 'none' : 'joey'))}
            aria-pressed={pickMode === 'joey'}
          >
            {pickMode === 'joey' ? 'Placing Joey: click the map (click here to stop)' : 'Place Joey by hand'}
          </button>
          <p className="sub">If his beacon dies, open his Find My location on your phone and click the same spot on the map.</p>
          <button type="button" className="ctl" onClick={() => setBasemap((b) => (b === 'satellite' ? 'streets' : 'satellite'))}>
            Map: {basemap === 'satellite' ? 'Satellite' : 'Streets'}
          </button>
        </div>

        {message ? <p className={`toast ${message.startsWith('Error') ? 'red' : 'green'}`}>{message}</p> : null}
      </section>

      <section className="control-map">
        <ArcadeMap
          game={game}
          now={now}
          follow={false}
          basemap={basemap}
          padding={{ top: 20, right: 20, bottom: 20, left: 20 }}
          onPick={onMapClick}
          onBasemapFailed={() => setBasemap('streets')}
        />
      </section>
    </main>
  );
}
