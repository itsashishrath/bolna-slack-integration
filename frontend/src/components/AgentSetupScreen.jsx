import { useEffect, useState } from 'react';
import { getAgents, getAgentConfigs, saveAgentSlackWebhook } from '../api/client.js';

export default function AgentSetupScreen({ onDone }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // agentId → { slack_webhook_url, configured_at }
  const [configured, setConfigured] = useState({});

  // agentId → { value, saving, error }
  const [forms, setForms] = useState({});

  useEffect(() => {
    (async () => {
      const [agentsRes, configsRes] = await Promise.all([getAgents(), getAgentConfigs()]);
      setLoading(false);

      if (!agentsRes.ok) {
        setFetchError('Failed to load agents. Check your Bolna API key.');
        return;
      }

      setAgents(agentsRes.data || []);

      if (configsRes.ok && configsRes.data) {
        const map = {};
        configsRes.data.forEach((c) => { map[c.agent_id] = c; });
        setConfigured(map);
      }
    })();
  }, []);

  const anyConfigured = Object.keys(configured).length > 0;

  const setForm = (agentId, patch) =>
    setForms((f) => ({ ...f, [agentId]: { ...(f[agentId] || {}), ...patch } }));

  const handleSave = async (agentId) => {
    const url = (forms[agentId]?.value || '').trim();
    if (!url) {
      setForm(agentId, { error: 'Please enter a Slack webhook URL.' });
      return;
    }
    if (!url.startsWith('https://hooks.slack.com/services/')) {
      setForm(agentId, { error: 'Must start with https://hooks.slack.com/services/' });
      return;
    }
    setForm(agentId, { saving: true, error: '' });
    const result = await saveAgentSlackWebhook(agentId, url);
    if (result.ok) {
      setConfigured((c) => ({
        ...c,
        [agentId]: { agent_id: agentId, slack_webhook_url: url, configured_at: new Date().toISOString() },
      }));
      setForm(agentId, { value: '', saving: false, error: '' });
    } else {
      setForm(agentId, { saving: false, error: result.data?.detail || 'Failed to save. Please try again.' });
    }
  };

  return (
    <div className="setup-wrap setup-wrap-lg">
      <div className="step-indicator">
        <div className="step done"><span>✓</span> Bolna API Key</div>
        <div className="step-line active-line" />
        <div className="step active"><span>2</span> Configure Agents</div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>Set Slack Alerts per Agent</h2>
            <p>
              Assign a Slack Incoming Webhook URL to each agent. Configure at least one to continue.
            </p>
          </div>
        </div>

        {loading && (
          <div className="agents-loading">
            <div className="spinner small-spinner" />
            <span>Fetching agents…</span>
          </div>
        )}

        {fetchError && <p className="field-error">{fetchError}</p>}

        {!loading && !fetchError && agents.length === 0 && (
          <p className="muted">No agents found on your Bolna account.</p>
        )}

        {!loading && agents.length > 0 && (
          <div className="agent-setup-list">
            {agents.map((agent) => {
              const cfg = configured[agent.id];
              const form = forms[agent.id] || {};
              return (
                <div key={agent.id} className="agent-setup-item">
                  <div className="agent-setup-row">
                    <div className="agent-info">
                      <span className="agent-name">{agent.agent_name}</span>
                      <span className="agent-id">{agent.id}</span>
                    </div>
                    {cfg && <span className="inline-success">✓ Configured</span>}
                  </div>

                  {cfg ? (
                    <div className="agent-configured-url">
                      <span className="url-label">Slack webhook:</span>
                      <span className="url-value">{maskUrl(cfg.slack_webhook_url)}</span>
                      <button
                        className="btn-text"
                        onClick={() => {
                          setConfigured((c) => { const n = { ...c }; delete n[agent.id]; return n; });
                          setForm(agent.id, { value: cfg.slack_webhook_url });
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="agent-setup-form">
                      <input
                        type="url"
                        className="agent-url-input"
                        placeholder="https://hooks.slack.com/services/..."
                        value={form.value || ''}
                        onChange={(e) => setForm(agent.id, { value: e.target.value, error: '' })}
                      />
                      {form.error && <p className="field-error">{form.error}</p>}
                      <button
                        className="btn-outline"
                        onClick={() => handleSave(agent.id)}
                        disabled={form.saving}
                      >
                        {form.saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {anyConfigured && (
          <div className="setup-continue">
            <button onClick={onDone}>Go to Dashboard →</button>
          </div>
        )}
      </div>
    </div>
  );
}

function maskUrl(url) {
  try {
    const parts = url.split('/');
    return parts.slice(0, 5).join('/') + '/••••••••';
  } catch {
    return url;
  }
}
