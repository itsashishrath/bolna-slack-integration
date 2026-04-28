import StatusBadge from './StatusBadge.jsx';

function maskWebhook(url) {
  try {
    const parts = url.split('/');
    if (parts.length < 5) return url;
    return `${parts.slice(0, 4).join('/')}/••••••••`;
  } catch {
    return url;
  }
}

export default function ConfiguredScreen({ config }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Integration active</h2>
          <p>Your Slack webhook is configured and ready to receive Bolna alerts.</p>
        </div>
        <StatusBadge text="Active" variant="success" />
      </div>

      <div className="config-grid">
        <div className="config-item">
          <span>Webhook URL</span>
          <strong>{maskWebhook(config.slack_webhook_url)}</strong>
        </div>
        <div className="config-item">
          <span>Configured at</span>
          <strong>{new Date(config.configured_at).toLocaleString()}</strong>
        </div>
      </div>

      <div className="note-block">
        <p>
          Use the backend POST /webhook endpoint in Bolna's post-call webhook settings.
        </p>
      </div>
    </div>
  );
}
