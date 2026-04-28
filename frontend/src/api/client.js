const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function request(path, options = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, data, status: response.status };
  } catch (error) {
    return { ok: false, error: error.message || 'Network error' };
  }
}

// ── Health / status ───────────────────────────────────────────────────────────

export async function getHealth() {
  return request('/');
}

export async function getStatus() {
  return request('/status');
}

// ── Per-agent Slack config ────────────────────────────────────────────────────

export async function getAgentConfigs() {
  return request('/config/agents');
}

export async function saveAgentSlackWebhook(agentId, slackWebhookUrl) {
  return request('/config/agent', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, slack_webhook_url: slackWebhookUrl }),
  });
}

// ── Bolna ─────────────────────────────────────────────────────────────────────

export async function saveBolnaApiKey(apiKey) {
  return request('/bolna/api-key', {
    method: 'POST',
    body: JSON.stringify({ bolna_api_key: apiKey }),
  });
}

export async function getAgents() {
  return request('/bolna/agents');
}

export async function setupAgentWebhook(agentId) {
  return request(`/bolna/agents/${agentId}/setup-webhook`, { method: 'POST' });
}

export async function makeCall(agentId) {
  return request('/bolna/call', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId }),
  });
}
