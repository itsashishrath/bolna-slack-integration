import { useEffect, useMemo, useState } from 'react';
import { getHealth } from '../api/client.js';

export default function ServerWakeScreen({ onHealthy }) {
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState('Starting up the server, this may take a few seconds...');

  const status = useMemo(() => {
    if (elapsed >= 30) return 'timeout';
    if (elapsed >= 10) return 'waiting';
    return 'starting';
  }, [elapsed]);

  useEffect(() => {
    let active = true;
    let intervalId;

    const poll = async () => {
      const result = await getHealth();
      if (!active) return;

      if (result.ok) {
        onHealthy();
        return;
      }

      if (status === 'waiting') {
        setMessage("Still starting up — this may take a moment. If it doesn't respond, refresh the page.");
      }
      if (status === 'timeout') {
        setMessage("Server is taking longer than expected. Please refresh and try again.");
        clearInterval(intervalId);
      }
    };

    poll();
    intervalId = setInterval(() => {
      setElapsed((value) => value + 3);
      poll();
    }, 3000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [onHealthy, status]);

  return (
    <div className="status-card">
      <h2>Server wake-up check</h2>
      <p>{message}</p>
      <div className="spinner" />
    </div>
  );
}
