const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function request(path, options = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    if (response.status === 404) {
      return { ok: false, status: 404 };
    }

    const data = await response.json();
    return { ok: response.ok, data, status: response.status };
  } catch (error) {
    return { ok: false, error: error.message || 'Network error' };
  }
}

export async function getHealth() {
  return request('/');
}

export async function getConfig() {
  const result = await request('/config');
  if (result.status === 404) {
    return { ok: false, data: null };
  }
  return result;
}

export async function saveConfig(slackWebhookUrl) {
  const result = await request('/config', {
    method: 'POST',
    body: JSON.stringify({ slack_webhook_url: slackWebhookUrl }),
  });

  return result;
}
