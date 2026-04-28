import { useEffect, useRef, useState } from 'react';
import { getHealth } from '../api/client.js';

const TOTAL_SECONDS = 120;
const RETRY_EVERY   = 10;                            // seconds between health checks
const MAX_ATTEMPTS  = TOTAL_SECONDS / RETRY_EVERY;   // 12

const MESSAGES = [
  { at:  0, text: 'Starting up the server…' },
  { at: 30, text: 'Server is warming up, hang tight…' },
  { at: 60, text: 'Taking a little longer than usual…' },
  { at: 90, text: 'Almost ready, just a moment more…' },
];

function messageFor(elapsed) {
  return [...MESSAGES].reverse().find((m) => elapsed >= m.at).text;
}

export default function ServerWakeScreen({ onHealthy }) {
  const [elapsed, setElapsed]   = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  const activeRef   = useRef(true);
  const attemptsRef = useRef(0);
  const tickerRef   = useRef(null);
  const pollerRef   = useRef(null);

  useEffect(() => {
    activeRef.current = true;

    // Advance the bar every second
    tickerRef.current = setInterval(() => {
      setElapsed((e) => Math.min(e + 1, TOTAL_SECONDS));
    }, 1000);

    const tryConnect = async () => {
      if (!activeRef.current) return;
      attemptsRef.current += 1;

      const result = await getHealth();
      if (!activeRef.current) return;

      if (result.ok) {
        clearInterval(tickerRef.current);
        clearInterval(pollerRef.current);
        onHealthy();
        return;
      }

      if (attemptsRef.current >= MAX_ATTEMPTS) {
        clearInterval(tickerRef.current);
        clearInterval(pollerRef.current);
        setTimedOut(true);
      }
    };

    tryConnect();
    pollerRef.current = setInterval(tryConnect, RETRY_EVERY * 1000);

    return () => {
      activeRef.current = false;
      clearInterval(tickerRef.current);
      clearInterval(pollerRef.current);
    };
  }, [onHealthy]);

  if (timedOut) {
    return (
      <div className="status-card wake-card">
        <h2>Server unavailable</h2>
        <p>The server didn't respond after several attempts. Please refresh the page and try again.</p>
      </div>
    );
  }

  const progress = (elapsed / TOTAL_SECONDS) * 100;

  return (
    <div className="status-card wake-card">
      <h2>Connecting to server</h2>
      <p className="wake-message">{messageFor(elapsed)}</p>
      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
