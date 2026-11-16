'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ArcadeMap from '@/components/ArcadeMap';
import PixelSprite from '@/components/PixelSprite';
import Radar from '@/components/Radar';
import { FINISH, HINT_TIER_NAMES, LEVELS, START_LIVES } from '@/lib/config';
import { computeGame, type LogEntry } from '@/lib/game';
import { bearingDeg, compassPoint, formatClock, formatKm } from '@/lib/geo';
import { enableSound, playBlip, playJingle } from '@/lib/sfx';
import { JOEY_FRAMES } from '@/lib/sprites';
import { useGameState } from '@/lib/useGameState';

/** The big screen. Put this on the projector. Add ?demo to the URL to rehearse. */

const BANNER_MS: Partial<Record<LogEntry['kind'], number>> = { gremlin: 10_000, lost: 10_000, hint: 9000, pellet: 7000 };

export default function BigScreen() {
  const [mode, setMode] = useState<'live' | 'demo' | null>(null);
  const [demoSpeed, setDemoSpeed] = useState(30);
  const [follow, setFollow] = useState(false);
  const [showTiles, setShowTiles] = useState(true);
  const [sound, setSound] = useState(false);
  const [banner, setBanner] = useState<LogEntry | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const speed = Number(query.get('speed'));
    if (speed > 0) setDemoSpeed(speed);
    setMode(query.has('demo') ? 'demo' : 'live');
  }, []);

  const { raw, now, online } = useGameState(mode, demoSpeed);
  const game = useMemo(() => computeGame(raw, now), [raw, now]);

  // Pop a banner (and a jingle) whenever something new lands in the log.
  const seenLog = useRef<number | null>(null);
  const logLength = game.log.length;
  const newest = game.log[logLength - 1];
  useEffect(() => {
    if (!raw.gameId) return;
    if (seenLog.current === null) {
      // First load: do not replay history, except in demo where READY! should show.
      seenLog.current = mode === 'demo' ? 0 : logLength;
    }
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
      if (e.key === 'm') setShowTiles((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const level = LEVELS[game.level];
  const homeBearing = game.position ? compassPoint(bearingDeg(game.position, FINISH)) : null;
  const statusClass = game.status.toLowerCase().replace(' ', '-');
  const feed = game.log.slice(-5).reverse();
  const signalAgeS = game.position ? Math.round((now - game.position.t) / 1000) : null;

  return (
    <main className="screen">
      <header className="hud">
        <div className="hud-title">
          <span className="logo">JOEY&apos;S WAY HOME</span>
          {mode === 'demo' ? <span className="tag tag-demo">DEMO</span> : null}
          {!online ? <span className="tag tag-off">OFFLINE</span> : null}
        </div>
        <div className="hud-cell">
          <span className="hud-label">SCORE</span>
          <span className="hud-value yellow">{String(game.score).padStart(6, '0')}</span>
        </div>
        <div className="hud-cell">
          <span className="hud-label">LEVEL {game.level + 1}/{LEVELS.length}</span>
          <span className="hud-value cyan">{level.name}</span>
        </div>
        <div className="hud-cell">
          <span className="hud-label">TO HOME</span>
          <span className="hud-value green">{game.distanceHomeM === null ? '--' : formatKm(game.distanceHomeM)}</span>
        </div>
        <div className="hud-cell">
          <span className="hud-label">TIME</span>
          <span className="hud-value">{formatClock(game.elapsedMs)}</span>
        </div>
      </header>

      <section className="stage">
        <ArcadeMap game={game} now={now} follow={follow} showTiles={showTiles} onUserPan={() => setFollow(false)} />

        {game.phase === 'waiting' ? (
          <div className="overlay">
            <p className="overlay-big blink">INSERT JOEY</p>
            <p className="overlay-small">
              {game.position ? 'JOEY IS IN THE UBER. BLINDFOLD ON.' : 'WAITING FOR A SIGNAL FROM JOEY'}
            </p>
          </div>
        ) : null}

        {game.phase === 'home' ? (
          <div className="overlay overlay-home">
            <p className="overlay-big rainbow">JOEY IS HOME!</p>
            <p className="overlay-score">{String(game.score).padStart(6, '0')}</p>
            <p className="overlay-small">
              TIME {formatClock(game.elapsedMs)} · RODE {formatKm(game.riddenM)} · {game.dotsEaten} DOTS ·{' '}
              {game.lives} {game.lives === 1 ? 'LIFE' : 'LIVES'} LEFT · LOST {game.lostCount}X
            </p>
          </div>
        ) : null}

        {banner && game.phase !== 'home' ? (
          <div className={`banner banner-${banner.kind}`} role="status">
            <p className="banner-title">{banner.title}</p>
            {banner.sub ? <p className="banner-sub">{banner.sub}</p> : null}
          </div>
        ) : null}

        <div className="controls">
          <button type="button" onClick={() => setFollow((v) => !v)} aria-pressed={follow}>
            {follow ? 'CAM: FOLLOW' : 'CAM: OVERVIEW'} [F]
          </button>
          <button type="button" onClick={() => setShowTiles((v) => !v)} aria-pressed={showTiles}>
            {showTiles ? 'STREETS: ON' : 'STREETS: OFF'} [M]
          </button>
          <button
            type="button"
            onClick={() => {
              enableSound();
              setSound(true);
              playJingle('pellet');
            }}
            aria-pressed={sound}
          >
            {sound ? 'SOUND: ON' : 'SOUND: OFF'}
          </button>
        </div>
      </section>

      <aside className="side">
        <div className="panel row">
          <div>
            <p className="panel-label">LIVES</p>
            <div className="icons">
              {Array.from({ length: START_LIVES }, (_, i) => (
                <PixelSprite key={i} sprite={JOEY_FRAMES[0]} scale={2} dim={i >= game.lives} />
              ))}
            </div>
          </div>
          <div>
            <p className="panel-label">HINT TOKENS</p>
            <p className="tokens">
              <span className="token-dot" /> x{game.tokens}
            </p>
          </div>
        </div>

        <div className={`panel status status-${statusClass}`}>
          <p className="status-text">{game.status}</p>
          <p className="status-sub">
            {game.phase === 'riding'
              ? `${game.trend === 'WARMER' ? 'GETTING WARMER' : game.trend === 'COLDER' ? 'GETTING COLDER' : 'HOLDING STEADY'}${
                  homeBearing ? ` · HOME IS ${homeBearing}` : ''
                }`
              : game.phase === 'home'
                ? 'SNACK TIME'
                : 'BLINDFOLD STILL ON'}
          </p>
          {game.phase === 'riding' && game.driftM >= 50 ? <p className="status-sub">OFF COURSE BY {formatKm(game.driftM)}</p> : null}
          {game.phase === 'riding' && signalAgeS !== null && signalAgeS > 90 ? (
            <p className="status-sub red">NO SIGNAL FOR {Math.floor(signalAgeS / 60)} MIN</p>
          ) : null}
        </div>

        {game.activeChallenge ? (
          <div className="panel card card-lost">
            <p className="panel-label">ROOM CHALLENGE: WIN JOEY A TOKEN</p>
            <p className="card-text">{game.activeChallenge}</p>
          </div>
        ) : game.lastHint ? (
          <div className="panel card card-hint">
            <p className="panel-label">
              LAST HINT · {HINT_TIER_NAMES[game.lastHint.tier - 1]} · READ IT TO JOEY
            </p>
            <p className="card-text">{game.lastHint.text}</p>
          </div>
        ) : (
          <div className="panel card">
            <p className="panel-label">HOW TO HELP</p>
            <p className="card-text">No directions unless a hint is bought. Pellets earn tokens. Cheer loudly.</p>
          </div>
        )}

        <div className="panel feed">
          <p className="panel-label">FEED</p>
          {feed.length === 0 ? <p className="feed-item dim">NOTHING YET</p> : null}
          {feed.map((entry) => (
            <p key={entry.id} className={`feed-item feed-${entry.kind}`}>
              {entry.title}
            </p>
          ))}
        </div>

        <div className="panel radar-panel">
          <p className="panel-label">RADAR</p>
          <Radar game={game} />
        </div>
      </aside>
    </main>
  );
}
