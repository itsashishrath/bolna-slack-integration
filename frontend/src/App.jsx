import { useEffect, useState } from 'react';
import { getConfig, saveConfig } from './api/client';
import ServerWakeScreen from './components/ServerWakeScreen.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import ConfiguredScreen from './components/ConfiguredScreen.jsx';

function App() {
  const [stage, setStage] = useState('waking');
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadConfig = async () => {
      setError('');
      const configResult = await getConfig();
      if (!active) return;

      if (configResult.ok && configResult.data) {
        setConfig(configResult.data);
        setStage('configured');
      } else {
        setStage('setup');
      }
    };

    if (stage === 'loading-config') {
      loadConfig();
    }

    return () => {
      active = false;
    };
  }, [stage]);

  const handleHealthy = () => {
    setStage('loading-config');
  };

  const handleConfigSaved = async (url) => {
    setError('');
    const result = await saveConfig(url);
    if (result.ok) {
      setConfig(result.data);
      setStage('configured');
      return true;
    }

    setError(result.error || 'Unable to save config.');
    return false;
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Bolna → Slack</h1>
          <p>Integration dashboard for the call alert webhook.</p>
        </div>
      </header>

      <main>
        {stage === 'waking' && <ServerWakeScreen onHealthy={handleHealthy} />}

        {stage === 'setup' && (
          <SetupScreen onConfigSaved={handleConfigSaved} initialError={error} />
        )}

        {stage === 'configured' && config && (
          <ConfiguredScreen config={config} />
        )}

        {stage === 'loading-config' && (
          <div className="status-card">
            <p>Loading configuration…</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
