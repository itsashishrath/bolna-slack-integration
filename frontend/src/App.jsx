import { useState } from 'react';
import { getStatus, saveBolnaApiKey } from './api/client';
import ServerWakeScreen from './components/ServerWakeScreen.jsx';
import BolnaSetupScreen from './components/BolnaSetupScreen.jsx';
import AgentSetupScreen from './components/AgentSetupScreen.jsx';
import DashboardScreen from './components/DashboardScreen.jsx';

// stages: waking | loading | bolna-setup | agent-setup | dashboard

function App() {
  const [stage, setStage] = useState('waking');

  const loadStatus = async () => {
    setStage('loading');
    const result = await getStatus();
    if (!result.ok) { setStage('bolna-setup'); return; }

    const { bolna_configured, any_agent_configured } = result.data;
    if (!bolna_configured) {
      setStage('bolna-setup');
    } else if (!any_agent_configured) {
      setStage('agent-setup');
    } else {
      setStage('dashboard');
    }
  };

  const handleBolnaSaved = async (apiKey) => {
    const result = await saveBolnaApiKey(apiKey);
    if (result.ok) { setStage('agent-setup'); return true; }
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
          <div className="status-card"><div className="spinner" /></div>
        )}

        {stage === 'bolna-setup' && (
          <BolnaSetupScreen onApiKeySaved={handleBolnaSaved} />
        )}

        {stage === 'agent-setup' && (
          <AgentSetupScreen onDone={() => setStage('dashboard')} />
        )}

        {stage === 'dashboard' && <DashboardScreen />}
      </main>
    </div>
  );
}

export default App;
