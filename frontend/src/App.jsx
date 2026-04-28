import { useState } from 'react';
import { getStatus, saveConfig, saveBolnaApiKey } from './api/client';
import ServerWakeScreen from './components/ServerWakeScreen.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import BolnaSetupScreen from './components/BolnaSetupScreen.jsx';
import DashboardScreen from './components/DashboardScreen.jsx';

// stages: waking | loading | slack-setup | bolna-setup | dashboard

function App() {
  const [stage, setStage] = useState('waking');
  const [error, setError] = useState('');

  const loadStatus = async () => {
    setStage('loading');
    const result = await getStatus();
    if (!result.ok) {
      setStage('slack-setup');
      return;
    }
    const { slack_configured, bolna_configured } = result.data;
    if (!slack_configured) {
      setStage('slack-setup');
    } else if (!bolna_configured) {
      setStage('bolna-setup');
    } else {
      setStage('dashboard');
    }
  };

  const handleSlackSaved = async (url) => {
    setError('');
    const result = await saveConfig(url);
    if (result.ok) {
      setStage('bolna-setup');
      return true;
    }
    setError(result.data?.detail || 'Unable to save config.');
    return false;
  };

  const handleBolnaSaved = async (apiKey) => {
    const result = await saveBolnaApiKey(apiKey);
    if (result.ok) {
      setStage('dashboard');
      return true;
    }
    return false;
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Bolna <span className="arrow">→</span> Slack</h1>
          <p>Manage agents, webhooks, and call alerts from one place.</p>
        </div>
      </header>

      <main>
        {stage === 'waking' && <ServerWakeScreen onHealthy={loadStatus} />}

        {stage === 'loading' && (
          <div className="status-card">
            <div className="spinner" />
          </div>
        )}

        {stage === 'slack-setup' && (
          <SetupScreen onConfigSaved={handleSlackSaved} initialError={error} />
        )}

        {stage === 'bolna-setup' && (
          <BolnaSetupScreen onApiKeySaved={handleBolnaSaved} />
        )}

        {stage === 'dashboard' && <DashboardScreen />}
      </main>
    </div>
  );
}

export default App;
