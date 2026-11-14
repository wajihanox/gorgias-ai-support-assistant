/**
 * Health Check Endpoint
 * Returns service status and configuration state
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const config = {
    gorgias: !!Deno.env.get('GORGIAS_SUBDOMAIN') && 
             !!Deno.env.get('GORGIAS_EMAIL') && 
             !!Deno.env.get('GORGIAS_API_KEY'),
    anthropic: !!Deno.env.get('ANTHROPIC_API_KEY'),
    webhookSecret: !!Deno.env.get('GORGIAS_WEBHOOK_SECRET'),
    autoSend: Deno.env.get('AUTO_SEND')?.toLowerCase() === 'true',
  };

  const allConfigured = config.gorgias && config.anthropic;

  return new Response(
    JSON.stringify({
      status: allConfigured ? 'healthy' : 'misconfigured',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      configuration: {
        gorgiasConnected: config.gorgias,
        anthropicConnected: config.anthropic,
        webhookSecretConfigured: config.webhookSecret,
        autoSendEnabled: config.autoSend,
      },
      mode: config.autoSend ? 'auto-send' : 'human-review',
    }),
    {
      status: allConfigured ? 200 : 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
