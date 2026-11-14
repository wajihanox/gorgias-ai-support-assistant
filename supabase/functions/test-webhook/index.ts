/**
 * Test Webhook Endpoint
 * Simulates a Gorgias ticket-created event for local testing
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const ticketId = body.ticket_id;

    if (!ticketId) {
      return new Response(
        JSON.stringify({ error: 'ticket_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the webhook URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/gorgias-webhook`;

    // Simulate the Gorgias webhook payload
    const webhookPayload = {
      event: 'ticket-created',
      ticket_id: ticketId,
      ticket: {
        id: ticketId,
      },
    };

    console.log(`[Test] Sending simulated webhook for ticket ${ticketId}`);

    // Call the actual webhook handler
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(webhookPayload),
    });

    const result = await response.json();

    return new Response(
      JSON.stringify({
        message: 'Test webhook sent',
        ticketId,
        webhookResponse: result,
      }),
      {
        status: response.ok ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Test] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
