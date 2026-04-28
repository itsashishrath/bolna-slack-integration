import { useEffect, useState } from 'react';
import { getAgents, setupAgentWebhook, makeCall } from '../api/client.js';
import StatusBadge from './StatusBadge.jsx';

export default function DashboardScreen() {
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState('');

  const [webhookState, setWebhookState] = useState({}); // agentId → 'loading' | 'done' | 'error'

  const [selectedAgent, setSelectedAgent] = useState('');
  const [callState, setCallState] = useState('idle'); // idle | loading | success | error
  const [callMessage, setCallMessage] = useState('');

  useEffect(() => {
    (async () => {
      const result = await getAgents();
      setAgentsLoading(false);
      if (result.ok && result.data) {
        setAgents(result.data);
        if (result.data.length > 0) setSelectedAgent(result.data[0].id);
      } else {
        setAgentsError(
          result.data?.detail || 'Failed to load agents. Check your Bolna API key.'
        );
      }
    })();
  }, []);

  const handleSetWebhook = async (agentId) => {
    setWebhookState((s) => ({ ...s, [agentId]: 'loading' }));
    const result = await setupAgentWebhook(agentId);
    setWebhookState((s) => ({ ...s, [agentId]: result.ok ? 'done' : 'error' }));
  };

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
      setCallMessage(result.data?.detail || 'Failed to initiate call. Please try again.');
    }
  };

  return (
    <>
      {/* Status card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Integration active</h2>
            <p>Slack and Bolna are connected and ready.</p>
          </div>
          <StatusBadge text="Live" variant="success" />
        </div>

        <div className="status-row">
          <div className="status-item">
            <span className="status-dot dot-green" />
            <span className="status-item-label">Slack Webhook</span>
            <span className="status-item-value">Configured</span>
          </div>
          <div className="status-item">
            <span className="status-dot dot-green" />
            <span className="status-item-label">Bolna API Key</span>
            <span className="status-item-value">Configured</span>
          </div>
        </div>
      </div>

      {/* Agents card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Your Agents</h2>
            <p>Register this server's <code>/webhook</code> endpoint on any agent.</p>
          </div>
          {!agentsLoading && agents.length > 0 && (
            <StatusBadge text={`${agents.length} agent${agents.length !== 1 ? 's' : ''}`} variant="neutral" />
          )}
        </div>

        {agentsLoading && (
          <div className="agents-loading">
            <div className="spinner small-spinner" />
            <span>Fetching agents…</span>
          </div>
        )}

        {agentsError && <p className="field-error">{agentsError}</p>}

        {!agentsLoading && !agentsError && agents.length === 0 && (
          <p className="muted">No agents found on your Bolna account.</p>
        )}

        {!agentsLoading && agents.length > 0 && (
          <div className="agents-list">
            {agents.map((agent) => {
              const ws = webhookState[agent.id];
              return (
                <div key={agent.id} className="agent-item">
                  <div className="agent-info">
                    <span className="agent-name">{agent.agent_name}</span>
                    <span className="agent-id">{agent.id}</span>
                  </div>
                  <div className="agent-action">
                    {ws === 'done' && <span className="inline-success">Webhook set ✓</span>}
                    {ws === 'error' && <span className="inline-error">Failed — try again</span>}
                    <button
                      className="btn-outline"
                      onClick={() => handleSetWebhook(agent.id)}
                      disabled={ws === 'loading' || ws === 'done'}
                    >
                      {ws === 'loading' ? 'Setting…' : ws === 'done' ? 'Set ✓' : 'Set Webhook'}
                    </button>
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

        {agentsLoading ? (
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
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                setCallState('idle');
                setCallMessage('');
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.agent_name}
                </option>
              ))}
            </select>

            {callMessage && (
              <p className={callState === 'success' ? 'inline-success' : 'inline-error'}>
                {callMessage}
              </p>
            )}

            <button onClick={handleCall} disabled={callState === 'loading' || !selectedAgent}>
              {callState === 'loading' ? 'Calling…' : '📞 Call Now'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
