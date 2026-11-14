import { useState, useEffect } from 'react';
import { Activity, CheckCircle, XCircle, AlertCircle, Zap, Clock, Send, FileText, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { supabase } from '@/integrations/supabase/client';

interface HealthStatus {
  status: string;
  timestamp: string;
  version: string;
  configuration: {
    gorgiasConnected: boolean;
    anthropicConnected: boolean;
    webhookSecretConfigured: boolean;
    autoSendEnabled: boolean;
  };
  mode: string;
}

export default function Index() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testTicketId, setTestTicketId] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const checkHealth = async () => {
    if (!supabase) {
      setError('Cloud Backend not configured');
      setLoading(false);
      return;
    }

    try {
      const { data, error: funcError } = await supabase.functions.invoke('health');
      if (funcError) throw funcError;
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const runTest = async () => {
    if (!supabase || !testTicketId.trim()) return;

    setTesting(true);
    setTestResult(null);

    try {
      const { data, error: funcError } = await supabase.functions.invoke('test-webhook', {
        body: { ticket_id: parseInt(testTicketId, 10) }
      });

      if (funcError) throw funcError;
      setTestResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div data-ev-id="ev_130849492d" className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header data-ev-id="ev_68a8c923b8" className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div data-ev-id="ev_2b973702d1" className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div data-ev-id="ev_8696054deb" className="flex items-center gap-3">
            <div data-ev-id="ev_bfa8d6aa86" className="p-2 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div data-ev-id="ev_76e6c60e8d">
              <h1 data-ev-id="ev_b04afa18ca" className="text-xl font-bold">Gorgias AI Support</h1>
              <p data-ev-id="ev_43bea7c5c8" className="text-sm text-slate-400">Automated ticket response system</p>
            </div>
          </div>
          <Link
            to="/"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-colors flex items-center gap-2">

            <Send className="w-4 h-4" />
            Send Ticket
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main data-ev-id="ev_99ec9d54c2" className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Status Cards */}
        <div data-ev-id="ev_5f72afd13b" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatusCard
            icon={<Activity className="w-5 h-5" />}
            label="Service Status"
            value={loading ? 'Checking...' : health?.status === 'healthy' ? 'Healthy' : 'Needs Setup'}
            status={loading ? 'loading' : health?.status === 'healthy' ? 'success' : 'error'} />

          <StatusCard
            icon={health?.configuration.autoSendEnabled ? <Send className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            label="Mode"
            value={health?.configuration.autoSendEnabled ? 'Auto-Send' : 'Human Review'}
            status={health ? 'success' : 'loading'} />

          <StatusCard
            icon={<Clock className="w-5 h-5" />}
            label="Last Check"
            value={health ? new Date(health.timestamp).toLocaleTimeString() : '-'}
            status="neutral" />

          <StatusCard
            icon={<Zap className="w-5 h-5" />}
            label="Version"
            value={health?.version || '-'}
            status="neutral" />

        </div>

        {/* Configuration Status */}
        <section data-ev-id="ev_d361b121a2" className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div data-ev-id="ev_ed6612504a" className="px-6 py-4 border-b border-slate-800">
            <h2 data-ev-id="ev_bc89e19571" className="text-lg font-semibold">Configuration Status</h2>
          </div>
          <div data-ev-id="ev_96b7741f1f" className="p-6">
            {loading ?
            <div data-ev-id="ev_4a98aa6eff" className="text-slate-400">Loading configuration...</div> :
            error ?
            <div data-ev-id="ev_9a3d091890" className="flex items-center gap-2 text-amber-400">
                <AlertCircle className="w-5 h-5" />
                <span data-ev-id="ev_062fc65236">{error}</span>
              </div> :
            health ?
            <div data-ev-id="ev_e8dbe1138f" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ConfigItem
                label="Gorgias API"
                description="GORGIAS_SUBDOMAIN, EMAIL, API_KEY"
                connected={health.configuration.gorgiasConnected} />

                <ConfigItem
                label="Anthropic API"
                description="ANTHROPIC_API_KEY"
                connected={health.configuration.anthropicConnected} />

                <ConfigItem
                label="Webhook Secret"
                description="GORGIAS_WEBHOOK_SECRET (optional)"
                connected={health.configuration.webhookSecretConfigured}
                optional />

                <ConfigItem
                label="Auto-Send Mode"
                description={health.configuration.autoSendEnabled ? 'Replies sent automatically' : 'Drafts saved for review'}
                connected={true}
                isMode />

              </div> :
            null}
          </div>
        </section>

        {/* Test Section */}
        <section data-ev-id="ev_773a8beb9f" className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div data-ev-id="ev_80ba3089aa" className="px-6 py-4 border-b border-slate-800">
            <h2 data-ev-id="ev_fe425bcb78" className="text-lg font-semibold">Test AI Response</h2>
            <p data-ev-id="ev_6cbd6596e5" className="text-sm text-slate-400 mt-1">Simulate a ticket-created event to test the AI response</p>
          </div>
          <div data-ev-id="ev_aa0909ee5a" className="p-6 flex flex-col gap-4">
            <div data-ev-id="ev_d9bee014c1" className="flex gap-3">
              <input data-ev-id="ev_5d2689ff22"
              type="number"
              placeholder="Enter Gorgias Ticket ID"
              value={testTicketId}
              onChange={(e) => setTestTicketId(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" />

              <button data-ev-id="ev_f25c0a51a8"
              onClick={runTest}
              disabled={testing || !testTicketId.trim()}
              className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium transition-colors">

                {testing ? 'Testing...' : 'Run Test'}
              </button>
            </div>
            {testResult &&
            <pre data-ev-id="ev_fe97a3610c" className="p-4 bg-slate-950 rounded-lg text-sm text-slate-300 overflow-x-auto">
                {testResult}
              </pre>
            }
          </div>
        </section>

        {/* Setup Instructions */}
        <section data-ev-id="ev_4cfc50df54" className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div data-ev-id="ev_5d4deb348c" className="px-6 py-4 border-b border-slate-800">
            <h2 data-ev-id="ev_7144b79652" className="text-lg font-semibold">Setup Instructions</h2>
          </div>
          <div data-ev-id="ev_f598a6b7bf" className="p-6 flex flex-col gap-6">
            <SetupStep
              number={1}
              title="Add Required Secrets"
              description="Go to Settings → Secrets and add the following:">

              <ul data-ev-id="ev_fbcda429fa" className="mt-2 flex flex-col gap-1 text-sm text-slate-400">
                <li data-ev-id="ev_d402576119"><code data-ev-id="ev_9476f991a9" className="text-violet-400">GORGIAS_SUBDOMAIN</code> - Your Gorgias subdomain (e.g., 'mystore')</li>
                <li data-ev-id="ev_248796ec21"><code data-ev-id="ev_7124dc6074" className="text-violet-400">GORGIAS_EMAIL</code> - Your Gorgias account email</li>
                <li data-ev-id="ev_86fbd25c75"><code data-ev-id="ev_befab83201" className="text-violet-400">GORGIAS_API_KEY</code> - API key from Gorgias Settings → REST API</li>
                <li data-ev-id="ev_cd8258754a"><code data-ev-id="ev_a7c8a94d95" className="text-violet-400">ANTHROPIC_API_KEY</code> - Your Anthropic API key</li>
                <li data-ev-id="ev_8004608468"><code data-ev-id="ev_8d79cb076b" className="text-violet-400">AUTO_SEND</code> - Set to 'true' for auto-send, 'false' for drafts (default)</li>
                <li data-ev-id="ev_fc5d740253"><code data-ev-id="ev_1e424ba005" className="text-violet-400">GORGIAS_WEBHOOK_SECRET</code> - (Optional) For webhook signature verification</li>
              </ul>
            </SetupStep>

            <SetupStep
              number={2}
              title="Register Webhook in Gorgias"
              description="Configure Gorgias to send events to your webhook:">

              <ol data-ev-id="ev_5d8fd99b18" className="mt-2 flex flex-col gap-1 text-sm text-slate-400 list-decimal list-inside">
                <li data-ev-id="ev_b2f022de49">Go to Gorgias → Settings → Integrations → HTTP Integration</li>
                <li data-ev-id="ev_e363506bd6">Click "Add HTTP Integration"</li>
                <li data-ev-id="ev_2b3e4a373f">Set Method: <strong data-ev-id="ev_a6ee26bb2e">POST</strong></li>
                <li data-ev-id="ev_69ef30a26c">Set URL to your webhook endpoint (shown in Settings → Functions)</li>
                <li data-ev-id="ev_6931012b17">Select trigger: "Ticket Created"</li>
                <li data-ev-id="ev_7b0ad5cb15">Save the integration</li>
              </ol>
            </SetupStep>

            <SetupStep
              number={3}
              title="Test the Integration"
              description="Verify everything works:">

              <ol data-ev-id="ev_34c58b8ffc" className="mt-2 flex flex-col gap-1 text-sm text-slate-400 list-decimal list-inside">
                <li data-ev-id="ev_31e620f99b">Create a test ticket in Gorgias (or use an existing ticket ID above)</li>
                <li data-ev-id="ev_b61e767726">Check the ticket for the AI-generated draft or sent reply</li>
                <li data-ev-id="ev_cc56afe981">If using draft mode, look for tickets tagged "ai-draft-ready"</li>
              </ol>
            </SetupStep>
          </div>
        </section>
      </main>
    </div>);

}

function StatusCard({ icon, label, value, status




}: {icon: React.ReactNode;label: string;value: string;status: 'success' | 'error' | 'loading' | 'neutral';}) {
  const statusColors = {
    success: 'border-emerald-500/30 bg-emerald-500/10',
    error: 'border-red-500/30 bg-red-500/10',
    loading: 'border-slate-700 bg-slate-800/50',
    neutral: 'border-slate-700 bg-slate-800/50'
  };

  return (
    <div data-ev-id="ev_5b8769fed3" className={`p-4 rounded-xl border ${statusColors[status]} flex items-center gap-3`}>
      <div data-ev-id="ev_e933ce6174" className="text-slate-400">{icon}</div>
      <div data-ev-id="ev_8d629d4752">
        <div data-ev-id="ev_f079548f26" className="text-sm text-slate-400">{label}</div>
        <div data-ev-id="ev_cbd423bc33" className="font-semibold">{value}</div>
      </div>
    </div>);

}

function ConfigItem({ label, description, connected, optional, isMode





}: {label: string;description: string;connected: boolean;optional?: boolean;isMode?: boolean;}) {
  return (
    <div data-ev-id="ev_c4bde4bad3" className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
      {isMode ?
      <CheckCircle className="w-5 h-5 text-violet-500 mt-0.5" /> :
      connected ?
      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" /> :

      <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
      }
      <div data-ev-id="ev_6137d0cc4b">
        <div data-ev-id="ev_73edb4e313" className="font-medium flex items-center gap-2">
          {label}
          {optional && !connected &&
          <span data-ev-id="ev_701044be8d" className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-400">Optional</span>
          }
        </div>
        <div data-ev-id="ev_12c79b7482" className="text-sm text-slate-400">{description}</div>
      </div>
    </div>);

}

function SetupStep({ number, title, description, children




}: {number: number;title: string;description: string;children: React.ReactNode;}) {
  return (
    <div data-ev-id="ev_f090ac787e" className="flex gap-4">
      <div data-ev-id="ev_d6876842ad" className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center font-bold text-sm">
        {number}
      </div>
      <div data-ev-id="ev_a753282597" className="flex-1">
        <h3 data-ev-id="ev_26278f3ebf" className="font-semibold">{title}</h3>
        <p data-ev-id="ev_ddecd5fa5c" className="text-sm text-slate-400">{description}</p>
        {children}
      </div>
    </div>);

}