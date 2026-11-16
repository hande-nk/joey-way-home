'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ArcadeMap, { HAS_CARTO, type Basemap } from '@/components/ArcadeMap';
import PixelSprite from '@/components/PixelSprite';
import { FINISH, HINT_TIER_NAMES, LEVELS, PAR_MINUTES, START_LIVES } from '@/lib/config';
import { computeGame, type LogEntry } from '@/lib/game';
import { bearingDeg, compassPoint, distM, formatClock, formatKm } from '@/lib/geo';
import { enableSound, playBlip, playJingle } from '@/lib/sfx';
import { JOEY_FRAMES } from '@/lib/sprites';
import { useGameState } from '@/lib/useGameState';

/** The big screen. Put this on the projector. Add ?demo to the URL to rehearse. */

const BANNER_MS: Partial<Record<LogEntry['kind'], number>> = { gremlin: 10_000, lost: 10_000, hint: 9000, pellet: 7000 };
const STATUS_LABEL = { WAITING: 'Waiting', 'ON TRACK': 'On track', DRIFTING: 'Drifting', LOST: 'Lost', HOME: 'Home' } as const;
const PANEL_PADDING = { top: 96, right: 360, bottom: 110, left: 360 };

export default function BigScreen() {
  const [mode, setMode] = useState<'live' | 'demo' | null>(null);
  const [demoSpeed, setDemoSpeed] = useState(30);
  const [follow, setFollow] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>(HAS_CARTO ? 'streets' : 'satellite');
  const [sound, setSound] = useState(false);
  const [banner, setBanner] = useState<LogEntry | null>(null);
  const [wallClock, setWallClock] = useState('');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const speed = Number(query.get('speed'));
    if (speed > 0) setDemoSpeed(speed);
    if (query.get('map') === 'streets') setBasemap('streets');
    if (query.get('map') === 'satellite') setBasemap('satellite');
    setMode(query.has('demo') ? 'demo' : 'live');
    const tick = () => setWallClock(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);

  const { raw, now, online } = useGameState(mode, demoSpeed);
  const game = useMemo(() => computeGame(raw, now), [raw, now]);

  // Pop a banner (and a jingle) whenever something new lands in the log.
  const seenLog = useRef<number | null>(null);
  const logLength = game.log.length;
  const newest = game.log[logLength - 1];
  useEffect(() => {
    if (!raw.gameId) return;
    if (seenLog.current === null) seenLog.current = mode === 'demo' ? 0 : logLength; // do not replay history on load
    if (logLength < seenLog.current) {
      seenLog.current = logLength; // game was reset
      setBanner(null);
      return;
    }
    if (logLength === seenLog.current || !newest) return;
    seenLog.current = logLength;
    setBanner(newest);
    playJingle(newest.kind);
    const timer = setTimeout(() => setBanner(null), BANNER_MS[newest.kind] ?? 5000);
    return () => clearTimeout(timer);
  }, [logLength, newest, raw.gameId, mode]);

  // Soft blip as dots get eaten.
  const dots = game.dotsEaten;
  const lastDots = useRef(0);
  useEffect(() => {
    if (dots > lastDots.current && sound) playBlip();
    lastDots.current = dots;
  }, [dots, sound]);

  // Keyboard shortcuts for whoever is driving the projector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f') setFollow((v) => !v);
      if (e.key === 'm') setBasemap((v) => (v === 'satellite' ? 'streets' : 'satellite'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const level = LEVELS[game.level];
  const homeBearing = game.position ? bearingDeg(game.position, FINISH) : null;
  const statusKey = game.status.toLowerCase().replace(' ', '-');
  const feed = game.log.slice(-6).reverse();
  const signalAgeS = game.position ? Math.round((now - game.position.t) / 1000) : null;
  const overPar = game.elapsedMs > PAR_MINUTES * 60_000;
  const courseM = distM(game.start, FINISH);

  return (
    <main className="screen">
      <ArcadeMap
        game={game}
        now={now}
        follow={follow}
        basemap={basemap}
        padding={PANEL_PADDING}
        onUserPan={() => setFollow(false)}
        onBasemapFailed={() => setBasemap('streets')}
      />
      <div className="shade" aria-hidden />

      {/* ---------------------------------------------------------------- top bar */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-row">
            {mode === 'demo' ? <span className="chip chip-lime">Demo</span> : <span className="chip chip-live">Live</span>}
            {!online ? <span className="chip chip-red">Offline</span> : null}
            <span className="brand-name">Joey&apos;s Way Home</span>
          </div>
          <h1 className="title">
            {game.start.name} → {FINISH.name}
          </h1>
          <p className="meta">
            {wallClock} · Par {PAR_MINUTES} min
          </p>
        </div>

        <nav className="segmented" aria-label="Camera">
          <button type="button" aria-pressed={!follow} onClick={() => setFollow(false)}>
            Overview
          </button>
          <button type="button" aria-pressed={follow} onClick={() => setFollow(true)}>
            Follow Joey
          </button>
        </nav>

        <div className="top-actions">
          <nav className="segmented small" aria-label="Map style">
            <button type="button" aria-pressed={basemap === 'satellite'} onClick={() => setBasemap('satellite')}>
              Satellite
            </button>
            <button type="button" aria-pressed={basemap === 'streets'} onClick={() => setBasemap('streets')}>
              Map
            </button>
          </nav>
          <button
            type="button"
            className="icon-button"
            aria-pressed={sound}
            onClick={() => {
              enableSound();
              setSound(true);
              playJingle('pellet');
            }}
          >
            {sound ? 'Sound on' : 'Sound off'}
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------------- left column */}
      <aside className="column left">
        <section className={`card status status-${statusKey}`}>
          <div className="card-head">
            <span className="card-label">Status</span>
            {game.phase === 'riding' ? (
              <span className={`chip ${game.trend === 'COLDER' ? 'chip-red' : game.trend === 'WARMER' ? 'chip-lime' : ''}`}>
                {game.trend === 'WARMER' ? 'Warmer' : game.trend === 'COLDER' ? 'Colder' : 'Steady'}
              </span>
            ) : null}
          </div>
          <div className="status-body">
            <div>
              <p className="status-text">{STATUS_LABEL[game.status]}</p>
              <p className="sub">
                {game.phase === 'waiting'
                  ? game.position
                    ? 'In the Uber, blindfold on'
                    : 'Waiting for a signal'
                  : game.phase === 'home'
                    ? 'Snack time'
                    : game.driftM >= 50
                      ? `${formatKm(game.driftM)} off his best`
                      : 'Heading the right way'}
              </p>
              {game.phase === 'riding' && signalAgeS !== null && signalAgeS > 90 ? (
                <p className="sub red">No signal for {Math.floor(signalAgeS / 60)} min</p>
              ) : null}
            </div>
            {homeBearing !== null && game.phase === 'riding' ? (
              <div className="compass" aria-label={`Home is ${compassPoint(homeBearing)}`}>
                <span className="compass-n">N</span>
                <svg viewBox="0 0 40 40" style={{ transform: `rotate(${homeBearing}deg)` }} aria-hidden>
                  <path d="M20 5 L27 26 L20 22 L13 26 Z" fill="currentColor" />
                </svg>
                <span className="compass-label">Home {compassPoint(homeBearing)}</span>
              </div>
            ) : null}
          </div>
        </section>

        {game.activeChallenge ? (
          <section className="card accent-red">
            <div className="card-head">
              <span className="card-label">Room challenge</span>
              <span className="chip chip-red">Win a token</span>
            </div>
            <p className="card-text">{game.activeChallenge}</p>
          </section>
        ) : game.lastHint ? (
          <section className="card accent-lime">
            <div className="card-head">
              <span className="card-label">Last hint · read it to Joey</span>
              <span className="chip chip-lime">{HINT_TIER_NAMES[game.lastHint.tier - 1]}</span>
            </div>
            <p className="card-text">{game.lastHint.text}</p>
          </section>
        ) : (
          <section className="card">
            <div className="card-head">
              <span className="card-label">House rules</span>
            </div>
            <p className="card-text muted">No directions unless a hint is bought. Pellets earn tokens. Keep this screen out of the FaceTime camera.</p>
          </section>
        )}
      </aside>

      {/* ---------------------------------------------------------------- right column */}
      <aside className="column right">
        <section className="card">
          <div className="stats">
            <div>
              <p className="card-label">To home</p>
              <p className="big">{game.distanceHomeM === null ? '--' : formatKm(game.distanceHomeM)}</p>
            </div>
            <div>
              <p className="card-label">Time</p>
              <p className={`big ${overPar ? 'red' : ''}`}>{formatClock(game.elapsedMs)}</p>
            </div>
            <div>
              <p className="card-label">Score</p>
              <p className="big">{game.score.toLocaleString()}</p>
            </div>
            <div>
              <p className="card-label">Walked</p>
              <p className="big">{formatKm(game.riddenM)}</p>
            </div>
          </div>
          <div className="divider" />
          <div className="inventory">
            <div>
              <p className="card-label">Lives</p>
              <div className="lives">
                {Array.from({ length: START_LIVES }, (_, i) => (
                  <PixelSprite key={i} sprite={JOEY_FRAMES[0]} scale={2} dim={i >= game.lives} />
                ))}
              </div>
            </div>
            <div>
              <p className="card-label">Hint tokens</p>
              <p className="tokens">
                <span className="token" aria-hidden />
                {game.tokens}
              </p>
            </div>
          </div>
        </section>

        <section className="card feed">
          <div className="card-head">
            <span className="card-label">Feed</span>
          </div>
          {feed.length === 0 ? <p className="feed-item muted">Nothing yet</p> : null}
          {feed.map((entry) => (
            <p key={entry.id} className={`feed-item feed-${entry.kind}`}>
              <span className="feed-dot" aria-hidden />
              <span className="feed-title">{entry.title}</span>
              <span className="feed-time">{game.startedAt ? formatClock(entry.t - game.startedAt).slice(3) : ''}</span>
            </p>
          ))}
        </section>
      </aside>

      {/* ---------------------------------------------------------------- bottom: level progress */}
      <footer className="levelbar">
        <div className="level-name">
          <span className="card-label">
            Level {game.level + 1} of {LEVELS.length}
          </span>
          <span className="level-title">{level.name}</span>
        </div>
        <div className="track" aria-label={`${Math.round(game.progress * 100)}% of the way home`}>
          <div className="track-fill" style={{ width: `${game.progress * 100}%` }} />
          {LEVELS.slice(1).map((l, i) => (
            <span
              key={l.name}
              className={`track-tick ${game.maxLevel > i && game.phase !== 'waiting' ? 'done' : ''}`}
              style={{ left: `${Math.max(0, 1 - (l.enterKm * 1000) / courseM) * 100}%` }}
              title={`Level ${i + 2}: ${l.name}`}
            />
          ))}
          <span className="track-joey" style={{ left: `${game.progress * 100}%` }}>
            <PixelSprite sprite={JOEY_FRAMES[0]} scale={2} />
          </span>
        </div>
        <span className="track-end">Home</span>
      </footer>

      {/* ---------------------------------------------------------------- overlays */}
      {game.phase === 'waiting' ? (
        <div className="overlay">
          <div className="overlay-card">
            <p className="card-label">Starting soon</p>
            <p className="overlay-big">Insert Joey</p>
            <p className="sub">{game.position ? 'Joey is in the Uber with the blindfold on.' : 'Waiting for a signal from Joey.'}</p>
          </div>
        </div>
      ) : null}

      {game.phase === 'home' ? (
        <div className="overlay">
          <div className="overlay-card">
            <p className="card-label">Final score</p>
            <p className="overlay-big lime">{game.score.toLocaleString()}</p>
            <p className="sub">
              {formatClock(game.elapsedMs)} · walked {formatKm(game.riddenM)} · {game.lives} {game.lives === 1 ? 'life' : 'lives'} left · lost {game.lostCount}×
            </p>
          </div>
        </div>
      ) : null}

      {banner && game.phase !== 'home' ? (
        <div className={`banner banner-${banner.kind}`} role="status">
          <span className="banner-dot" aria-hidden />
          <div>
            <p className="banner-title">{banner.title}</p>
            {banner.sub ? <p className="banner-sub">{banner.sub}</p> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
