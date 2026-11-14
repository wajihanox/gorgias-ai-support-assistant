/**
 * Get Last Ticket Edge Function
 *
 * Returns the HTML of the most recent email sent by an agent/API in Gorgias.
 * Optionally accepts a specific ticketId.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface GorgiasMessage {
  id: number;
  from_agent: boolean;
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  created_datetime?: string;
  sent_datetime?: string | null;
}

interface GorgiasTicket {
  id: number;
  subject?: string | null;
}

async function gorgiasGet<T>(endpoint: string): Promise<T> {
  const subdomain = Deno.env.get('GORGIAS_SUBDOMAIN');
  const email = Deno.env.get('GORGIAS_EMAIL');
  const apiKey = Deno.env.get('GORGIAS_API_KEY');

  if (!subdomain || !email || !apiKey) {
    throw new Error('Missing Gorgias configuration');
  }

  const url = `https://${subdomain}.gorgias.com/api${endpoint}`;
  console.log(`[GetLastTicket] GET ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': 'Basic ' + btoa(`${email}:${apiKey}`),
      'Accept': 'application/json',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[GetLastTicket] Error ${response.status}:`, text);
    throw new Error(`Gorgias API error ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function findLatestAgentMessage(ticketId: number) {
  const result = await gorgiasGet<{ data?: GorgiasMessage[] }>(`/tickets/${ticketId}/messages?limit=30`);
  const agentMessages = (result.data ?? [])
    .filter((m) => m.from_agent && (m.body_html?.trim() || m.body_text?.trim()))
    .sort((a, b) => (b.created_datetime ?? '').localeCompare(a.created_datetime ?? ''));
  return agentMessages[0] ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedId = body?.ticketId ? Number(body.ticketId) : null;

    if (body?.ticketId && (!requestedId || Number.isNaN(requestedId))) {
      return jsonResponse({ success: false, error: 'Ticket ID must be a number' });
    }

    let tickets: GorgiasTicket[];
    if (requestedId) {
      const ticket = await gorgiasGet<GorgiasTicket>(`/tickets/${requestedId}`);
      tickets = [ticket];
    } else {
      const list = await gorgiasGet<{ data?: GorgiasTicket[] }>(
        '/tickets?limit=10&order_by=created_datetime:desc'
      );
      tickets = list.data ?? [];
    }

    // Walk recent tickets until we find one with a sent (agent/API) message
    for (const ticket of tickets) {
      const message = await findLatestAgentMessage(ticket.id);
      if (!message) continue;

      const bodyHtml = message.body_html?.trim()
        ? message.body_html
        : `<p>${escapeHtml(message.body_text ?? '').replace(/\n/g, '<br>')}</p>`;

      return jsonResponse({
        success: true,
        ticketId: ticket.id,
        subject: message.subject || ticket.subject || '',
        bodyHtml,
        bodyText: message.body_text ?? '',
        sentAt: message.sent_datetime || message.created_datetime || null,
      });
    }

    return jsonResponse({
      success: false,
      error: requestedId
        ? `Ticket #${requestedId} has no sent email message`
        : 'No sent email found in the 10 most recent tickets',
    });
  } catch (error) {
    console.error('[GetLastTicket] Error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load last sent email',
    });
  }
});
