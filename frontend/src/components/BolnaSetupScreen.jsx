import { useState } from 'react';

export default function BolnaSetupScreen({ onApiKeySaved }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!value.trim()) { setError('Please enter your Bolna API key.'); return; }
    setError('');
    setLoading(true);
    const success = await onApiKeySaved(value.trim());
    setLoading(false);
    if (!success) setError('Failed to save API key. Please check and try again.');
  };

  return (
    <div className="setup-wrap">
      <div className="step-indicator">
        <div className="step active"><span>1</span> Bolna API Key</div>
        <div className="step-line" />
        <div className="step"><span>2</span> Configure Agents</div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>Connect Bolna</h2>
            <p>Enter your Bolna API key to fetch agents and manage webhooks.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="form-row">
          <label htmlFor="apikey">Bolna API Key</label>
          <input
            id="apikey"
            type="password"
            placeholder="bn-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          {error && <p className="field-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save & continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}
