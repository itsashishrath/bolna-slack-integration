import { useState } from 'react';
import StatusBadge from './StatusBadge.jsx';

export default function SetupScreen({ onConfigSaved, initialError }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(initialError || '');
  const [loading, setLoading] = useState(false);

  const validate = (url) => {
    if (!url) {
      return 'Please enter a webhook URL.';
    }
    if (!url.startsWith('https://hooks.slack.com/services/')) {
      return 'URL must start with https://hooks.slack.com/services/';
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = validate(value.trim());
    if (validation) {
      setError(validation);
      return;
    }

    setError('');
    setLoading(true);
    const success = await onConfigSaved(value.trim());
    setLoading(false);

    if (!success) {
      setError('Unable to save webhook. Please try again.');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Integration setup</h2>
          <p>Enter your Slack Incoming Webhook URL to start sending Bolna call alerts.</p>
        </div>
        <StatusBadge text="Not configured" variant="neutral" />
      </div>

      <form onSubmit={handleSubmit} className="form-row">
        <label htmlFor="webhook">Slack Incoming Webhook URL</label>
        <input
          id="webhook"
          type="url"
          placeholder="https://hooks.slack.com/services/..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
        />
        {error && <p className="field-error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save webhook'}
        </button>
      </form>
    </div>
  );
}
