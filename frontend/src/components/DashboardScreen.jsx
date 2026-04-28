import { useEffect, useState } from 'react';
import { getAgents, getAgentConfigs, setupAgentWebhook, makeCall, saveAgentSlackWebhook } from '../api/client.js';
import StatusBadge from './StatusBadge.jsx';

export default function DashboardScreen() {
  const [agents, setAgents] = useState([]);       // [{id, agent_name}]
  const [slackMap, setSlackMap] = useState({});   // agentId → AgentConfigEntry
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // agentId → 'loading' | 'done' | 'error'
  const [bolnaWebhookState, setBolnaWebhookState] = useState({});

  // agentId → { open, value, saving, error }
  const [editState, setEditState] = useState({});

  const [selectedAgent, setSelectedAgent] = useState('');
  const [callState, setCallState] = useState('idle');
  const [callMessage, setCallMessage] = useState('');

  useEffect(() => {
    (async () => {
      const [agentsRes, configsRes] = await Promise.all([getAgents(), getAgentConfigs()]);
      setLoading(false);

      if (agentsRes.ok && agentsRes.data) {
        setAgents(agentsRes.data);
        if (agentsRes.data.length > 0) setSelectedAgent(agentsRes.data[0].id);
      } else {
        setFetchError('Failed to load agents. Check your Bolna API key.');
      }

      if (configsRes.ok && configsRes.data) {
        const map = {};
        configsRes.data.forEach((c) => { map[c.agent_id] = c; });
        setSlackMap(map);
      }
    })();
  }, []);

  const configuredCount = Object.keys(slackMap).length;

  // ── Bolna webhook setup ────────────────────────────────────────────────────

  const handleSetBolnaWebhook = async (agentId) => {
    setBolnaWebhookState((s) => ({ ...s, [agentId]: 'loading' }));
    const result = await setupAgentWebhook(agentId);
    setBolnaWebhookState((s) => ({ ...s, [agentId]: result.ok ? 'done' : 'error' }));
  };

  // ── Slack webhook edit ─────────────────────────────────────────────────────

  const openEdit = (agentId, currentUrl = '') =>
    setEditState((s) => ({ ...s, [agentId]: { open: true, value: currentUrl, saving: false, error: '' } }));

  const setEdit = (agentId, patch) =>
    setEditState((s) => ({ ...s, [agentId]: { ...s[agentId], ...patch } }));

  const handleSaveSlack = async (agentId) => {
    const url = (editState[agentId]?.value || '').trim();
    if (!url.startsWith('https://hooks.slack.com/services/')) {
      setEdit(agentId, { error: 'Must be a valid Slack Incoming Webhook URL.' });
      return;
    }
    setEdit(agentId, { saving: true, error: '' });
    const result = await saveAgentSlackWebhook(agentId, url);
    if (result.ok) {
      setSlackMap((m) => ({
        ...m,
        [agentId]: { agent_id: agentId, slack_webhook_url: url, configured_at: new Date().toISOString() },
      }));
      setEditState((s) => ({ ...s, [agentId]: { open: false } }));
    } else {
      setEdit(agentId, { saving: false, error: result.data?.detail || 'Failed to save.' });
    }
  };

  // ── Call ───────────────────────────────────────────────────────────────────

  const handleCall = async () => {
    if (!selectedAgent) return;
    setCallState('loading');
    setCallMessage('');
    const result = await makeCall(selectedAgent);
    if (result.ok) {
      setCallState('success');
      setCallMessage('Call initiated successfully!');
    } else {
      setCallState('error');
      setCallMessage(result.data?.detail || 'Failed to initiate call.');
    }
  };

  return (
    <>
      {/* Status card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Integration active</h2>
            <p>Bolna is connected. {configuredCount} agent{configuredCount !== 1 ? 's' : ''} sending Slack alerts.</p>
          </div>
          <StatusBadge text="Live" variant="success" />
        </div>

        <div className="status-row">
          <div className="status-item">
            <span className="status-dot dot-green" />
            <span className="status-item-label">Bolna API Key</span>
            <span className="status-item-value">Configured</span>
          </div>
          <div className="status-item">
            <span className={`status-dot ${configuredCount > 0 ? 'dot-green' : 'dot-gray'}`} />
            <span className="status-item-label">Slack Alerts</span>
            <span className={configuredCount > 0 ? 'status-item-value' : 'status-item-none'}>
              {configuredCount > 0 ? `${configuredCount} agent${configuredCount !== 1 ? 's' : ''}` : 'None configured'}
            </span>
          </div>
        </div>
      </div>

      {/* Agents card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Agents</h2>
            <p>
              Set the Bolna post-call webhook and a Slack channel per agent.
            </p>
          </div>
          {!loading && agents.length > 0 && (
            <StatusBadge text={`${agents.length} agent${agents.length !== 1 ? 's' : ''}`} variant="neutral" />
          )}
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
          <div className="agents-list">
            {agents.map((agent) => {
              const slack = slackMap[agent.id];
              const bws = bolnaWebhookState[agent.id];
              const edit = editState[agent.id] || {};

              return (
                <div key={agent.id} className="agent-item agent-item-rich">
                  {/* Top row: name + actions */}
                  <div className="agent-item-top">
                    <div className="agent-info">
                      <span className="agent-name">{agent.agent_name}</span>
                      <span className="agent-id">{agent.id}</span>
                    </div>
                    <div className="agent-action">
                      {bws === 'done' && <span className="inline-success">Bolna webhook ✓</span>}
                      {bws === 'error' && <span className="inline-error">Failed</span>}
                      <button
                        className="btn-outline"
                        onClick={() => handleSetBolnaWebhook(agent.id)}
                        disabled={bws === 'loading' || bws === 'done'}
                      >
                        {bws === 'loading' ? 'Setting…' : bws === 'done' ? 'Set ✓' : 'Set Bolna Webhook'}
                      </button>
                    </div>
                  </div>

                  {/* Slack row */}
                  <div className="agent-slack-row">
                    {slack && !edit.open ? (
                      <>
                        <span className="status-dot dot-green" style={{ flexShrink: 0 }} />
                        <span className="slack-url-masked">{maskUrl(slack.slack_webhook_url)}</span>
                        <button className="btn-text" onClick={() => openEdit(agent.id, slack.slack_webhook_url)}>
                          Edit Slack URL
                        </button>
                      </>
                    ) : edit.open ? (
                      <div className="slack-edit-form">
                        <input
                          type="url"
                          className="agent-url-input"
                          placeholder="https://hooks.slack.com/services/..."
                          value={edit.value || ''}
                          onChange={(e) => setEdit(agent.id, { value: e.target.value, error: '' })}
                        />
                        {edit.error && <p className="field-error">{edit.error}</p>}
                        <div className="slack-edit-actions">
                          <button className="btn-outline" onClick={() => handleSaveSlack(agent.id)} disabled={edit.saving}>
                            {edit.saving ? 'Saving…' : 'Save'}
                          </button>
                          <button className="btn-text" onClick={() => setEditState((s) => ({ ...s, [agent.id]: { open: false } }))}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="status-dot dot-gray" style={{ flexShrink: 0 }} />
                        <span className="muted" style={{ fontSize: '0.85rem' }}>No Slack webhook</span>
                        <button className="btn-text" onClick={() => openEdit(agent.id)}>
                          + Add Slack URL
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Make a call card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Make a Call</h2>
            <p>Initiate an outbound call to the configured recipient phone number.</p>
          </div>
        </div>

        {loading ? (
          <p className="muted">Waiting for agents to load…</p>
        ) : agents.length === 0 ? (
          <p className="muted">No agents available to call.</p>
        ) : (
          <div className="form-row">
            <label htmlFor="agent-select">Select agent</label>
            <select
              id="agent-select"
              className="select-field"
              value={selectedAgent}
              onChange={(e) => { setSelectedAgent(e.target.value); setCallState('idle'); setCallMessage(''); }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.agent_name}</option>
              ))}
            </select>
            {!slackMap[selectedAgent] && (
              <p className="inline-error">
                No Slack webhook configured for this agent — set one above first.
              </p>
            )}
            {callMessage && (
              <p className={callState === 'success' ? 'inline-success' : 'inline-error'}>{callMessage}</p>
            )}
            <button
              onClick={handleCall}
              disabled={callState === 'loading' || !selectedAgent || !slackMap[selectedAgent]}
            >
              {callState === 'loading' ? 'Calling…' : '📞 Call Now'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function maskUrl(url) {
  try {
    const parts = url.split('/');
    return parts.slice(0, 5).join('/') + '/••••••••';
  } catch { return url; }
}
