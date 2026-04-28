import { useEffect, useState } from 'react';
import { getAgents, getAgentConfigs, makeCall, saveAgentSlackWebhook, deleteAgentSlackWebhook, saveBolnaApiKey, resetConfig } from '../api/client.js';
import StatusBadge from './StatusBadge.jsx';

export default function DashboardScreen({ onReset }) {
  const [agents, setAgents] = useState([]);
  const [slackMap, setSlackMap] = useState({});   // agentId → AgentConfigEntry
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [keyEdit, setKeyEdit] = useState({ open: false, value: '', saving: false, error: '' });

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

  // ── Full reset ─────────────────────────────────────────────────────────────

  const handleReset = async () => {
    if (!window.confirm('This will clear all saved keys and webhook URLs. Continue?')) return;
    await resetConfig();
    onReset();
  };

  // ── Bolna API key update ───────────────────────────────────────────────────

  const handleUpdateApiKey = async () => {
    const key = keyEdit.value.trim();
    if (!key) {
      setKeyEdit((k) => ({ ...k, error: 'Please enter your Bolna API key.' }));
      return;
    }
    setKeyEdit((k) => ({ ...k, saving: true, error: '' }));
    const result = await saveBolnaApiKey(key);
    if (!result.ok) {
      setKeyEdit((k) => ({ ...k, saving: false, error: 'Failed to save. Please try again.' }));
      return;
    }
    // Key saved — retry fetching agents
    setKeyEdit({ open: false, value: '', saving: false, error: '' });
    setFetchError('');
    setLoading(true);
    const agentsRes = await getAgents();
    setLoading(false);
    if (agentsRes.ok && agentsRes.data) {
      setAgents(agentsRes.data);
      if (agentsRes.data.length > 0) setSelectedAgent(agentsRes.data[0].id);
    } else {
      setFetchError('Still failing. Double-check your Bolna API key and try again.');
    }
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

  const handleDeleteSlack = async (agentId) => {
    await deleteAgentSlackWebhook(agentId);
    setSlackMap((m) => { const n = { ...m }; delete n[agentId]; return n; });
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
          <div className="card-header-actions">
            <StatusBadge text="Live" variant="success" />
            <button className="btn-reset" onClick={handleReset} title="Reset all configuration">
              <ResetIcon /> Reset
            </button>
          </div>
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
            <p>Manage the Slack alert channel for each agent.</p>
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
        {fetchError && (
          <div className="api-key-error-block">
            <p className="field-error">{fetchError}</p>
            {!keyEdit.open ? (
              <button className="btn-outline" onClick={() => setKeyEdit((k) => ({ ...k, open: true }))}>
                Update Bolna API Key
              </button>
            ) : (
              <div className="api-key-edit-form">
                <input
                  type="password"
                  className="agent-url-input"
                  placeholder="bn-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={keyEdit.value}
                  onChange={(e) => setKeyEdit((k) => ({ ...k, value: e.target.value, error: '' }))}
                  autoFocus
                />
                {keyEdit.error && <p className="field-error">{keyEdit.error}</p>}
                <div className="slack-edit-actions">
                  <button className="btn-outline" onClick={handleUpdateApiKey} disabled={keyEdit.saving}>
                    {keyEdit.saving ? 'Saving…' : 'Save & retry'}
                  </button>
                  <button className="btn-text" onClick={() => setKeyEdit({ open: false, value: '', saving: false, error: '' })}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {!loading && !fetchError && agents.length === 0 && (
          <p className="muted">No agents found on your Bolna account.</p>
        )}

        {!loading && agents.length > 0 && (
          <div className="agents-list">
            {agents.map((agent) => {
              const slack = slackMap[agent.id];
              const edit = editState[agent.id] || {};

              return (
                <div key={agent.id} className="agent-item agent-item-rich">
                  <div className="agent-item-top">
                    <div className="agent-info">
                      <span className="agent-name">{agent.agent_name}</span>
                      <span className="agent-id">{agent.id}</span>
                    </div>
                  </div>

                  <div className="agent-slack-row">
                    {slack && !edit.open ? (
                      <>
                        <span className="status-dot dot-green" style={{ flexShrink: 0 }} />
                        <span className="slack-url-masked">{maskUrl(slack.slack_webhook_url)}</span>
                        <button className="btn-text" onClick={() => openEdit(agent.id, slack.slack_webhook_url)}>
                          Edit
                        </button>
                        <button
                          className="btn-icon-danger"
                          title="Remove Slack webhook"
                          onClick={() => handleDeleteSlack(agent.id)}
                        >
                          <TrashIcon />
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

function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
