'use client';

import { useEffect, useRef, useState } from 'react';
import { postJson } from '@/lib/useGameState';

/**
 * Joey's page. It shows NO map and NO hints, only a share button.
 * Open it as /rider?key=RIDER_KEY on his phone.
 *
 * Limit to know about: phone browsers stop sending GPS when the tab is in the
 * background or the screen locks. It works during a FaceTime call as long as
 * Safari stays in front (FaceTime shrinks to picture in picture). The OwnTracks
 * app (see README) keeps working in the background, so it is the safer choice.
 */

const SEND_EVERY_MS = 4000;

type WakeLock = { release: () => Promise<void> };

export default function RiderPage() {
  const [key, setKey] = useState('');
  const [sharing, setSharing] = useState(false);
  const [sent, setSent] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const watchId = useRef<number | null>(null);
  const lastPost = useRef(0);
  const wakeLock = useRef<WakeLock | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('key');
    const saved = window.localStorage.getItem('jwh-rider-key');
    if (fromUrl) {
      setKey(fromUrl);
      window.localStorage.setItem('jwh-rider-key', fromUrl);
    } else if (saved) {
      setKey(saved);
    }
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function keepScreenOn() {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } };
      wakeLock.current = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      // Not supported or denied. Joey has to keep the screen on himself.
    }
  }

  function start() {
    if (!('geolocation' in navigator)) {
      setError('This browser has no GPS access.');
      return;
    }
    setError(null);
    setSharing(true);
    void keepScreenOn();
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setAccuracy(Math.round(pos.coords.accuracy));
        if (Date.now() - lastPost.current < SEND_EVERY_MS) return;
        lastPost.current = Date.now();
        const result = await postJson('/api/location', key, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
          t: pos.timestamp,
        });
        if (result.ok) {
          setSent((n) => n + 1);
          setLastSentAt(Date.now());
          setError(null);
        } else {
          setError(result.error ?? 'Could not send');
        }
      },
      (err) => setError(err.code === err.PERMISSION_DENIED ? 'Location permission denied. Allow it in settings.' : 'GPS error. Still trying.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    );
  }

  function stop() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    void wakeLock.current?.release();
    setSharing(false);
  }

  // The wake lock is dropped when the tab is hidden. Take it again on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && watchId.current !== null) void keepScreenOn();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const secondsAgo = lastSentAt ? Math.round((clock - lastSentAt) / 1000) : null;

  return (
    <main className="simple">
      <h1 className="page-title">Joey&apos;s beacon</h1>
      <p className="sub">No map, no hints, no cheating. This page only sends your location to the room.</p>

      <label className="field">
        <span>Rider key</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="from the host" autoCapitalize="off" autoCorrect="off" />
      </label>

      {sharing ? (
        <button type="button" className="big-button stop" onClick={stop}>
          Stop sharing
        </button>
      ) : (
        <button type="button" className="big-button go" onClick={start} disabled={!key}>
          Start sharing
        </button>
      )}

      <div className="card">
        <span className="card-label">Status</span>
        <p className={`status-text ${sharing ? 'lime' : 'muted'}`}>{sharing ? 'Beacon on' : 'Beacon off'}</p>
        <p className="sub">Fixes sent: {sent}</p>
        <p className="sub">Last sent: {secondsAgo === null ? '--' : `${secondsAgo}s ago`}</p>
        <p className="sub">GPS accuracy: {accuracy === null ? '--' : `${accuracy} m`}</p>
        {error ? <p className="sub red">{error}</p> : null}
      </div>

      <p className="sub">
        Keep this tab in front and the screen on. FaceTime keeps running as a small picture-in-picture window. Stop walking before you talk to
        the room.
      </p>
    </main>
  );
}
