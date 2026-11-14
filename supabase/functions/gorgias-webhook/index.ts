/**
 * Gorgias Webhook Handler
 * 
 * Receives ticket-created events from Gorgias, generates AI replies,
 * and either saves as draft or sends automatically based on AUTO_SEND.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

// ============================================================================
// Types
// ============================================================================

interface GorgiasCustomer {
  id: number;
  email: string;
  name?: string;
}

interface GorgiasMessage {
  id: number;
  body_text?: string;
  body_html?: string;
  created_datetime: string;
  sender?: {
    email: string;
    name?: string;
  };
  source?: {
    type: string;
  };
  from_agent: boolean;
}

interface GorgiasTicket {
  id: number;
  subject?: string;
  status: string;
  channel: string;
  customer: GorgiasCustomer;
  messages: GorgiasMessage[];
  tags?: { id: number; name: string }[];
  created_datetime: string;
}

interface GorgiasUser {
  id: number;
  email: string;
  name?: string;
}

interface WebhookPayload {
  event: string;
  ticket_id?: number;
  ticket?: {
    id: number;
  };
}

// ============================================================================
// Gorgias API Client
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

class GorgiasClient {
  private baseUrl: string;
  private authHeader: string;
  private email: string;

  constructor() {
    const subdomain = Deno.env.get('GORGIAS_SUBDOMAIN');
    const email = Deno.env.get('GORGIAS_EMAIL');
    const apiKey = Deno.env.get('GORGIAS_API_KEY');

    if (!subdomain || !email || !apiKey) {
      throw new Error('Missing Gorgias configuration. Please set GORGIAS_SUBDOMAIN, GORGIAS_EMAIL, and GORGIAS_API_KEY.');
    }

    this.baseUrl = `https://${subdomain}.gorgias.com/api`;
    this.authHeader = 'Basic ' + btoa(`${email}:${apiKey}`);
    this.email = email;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    retries = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`[Gorgias] ${method} ${endpoint}`);

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle rate limiting with retry
    if (response.status === 429 && retries < MAX_RETRIES) {
      const retryAfter = response.headers.get('Retry-After');
      const delayMs = retryAfter 
        ? parseInt(retryAfter, 10) * 1000 
        : RETRY_DELAY_MS * Math.pow(2, retries);
      
      console.log(`[Gorgias] Rate limited, retrying in ${delayMs}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return this.request<T>(method, endpoint, body, retries + 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gorgias API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  async getTicket(ticketId: number): Promise<GorgiasTicket> {
    return this.request<GorgiasTicket>('GET', `/tickets/${ticketId}`);
  }

  async getCurrentUser(): Promise<GorgiasUser> {
    const users = await this.request<{ data: GorgiasUser[] }>('GET', `/users?email=${encodeURIComponent(this.email)}`);
    if (!users.data || users.data.length === 0) {
      throw new Error('Could not find current user by email');
    }
    return users.data[0];
  }

  async postMessage(
    ticketId: number,
    options: {
      bodyHtml: string;
      senderId: number;
      receiverEmail: string;
      isInternal?: boolean;
    }
  ): Promise<GorgiasMessage> {
    const payload: Record<string, unknown> = {
      body_html: options.bodyHtml,
      channel: 'email',
      via: 'api',
      from_agent: true,
      sender: {
        id: options.senderId,
      },
      receiver: {
        email: options.receiverEmail,
      },
    };

    if (options.isInternal) {
      payload.channel = 'internal-note';
      delete payload.receiver;
    }

    return this.request<GorgiasMessage>('POST', `/tickets/${ticketId}/messages`, payload);
  }

  async addTag(ticketId: number, tagName: string): Promise<void> {
    const tagsResponse = await this.request<{ data: { id: number; name: string }[] }>(
      'GET',
      `/tags?name=${encodeURIComponent(tagName)}`
    );

    let tagId: number;
    if (tagsResponse.data && tagsResponse.data.length > 0) {
      tagId = tagsResponse.data[0].id;
    } else {
      const newTag = await this.request<{ id: number }>('POST', '/tags', { name: tagName });
      tagId = newTag.id;
    }

    await this.request('POST', `/tickets/${ticketId}/tags`, { id: tagId });
    console.log(`[Gorgias] Added tag "${tagName}" to ticket ${ticketId}`);
  }
}

// ============================================================================
// AI Reply Generation
// ============================================================================

const SYSTEM_PROMPT = `You are a helpful, professional customer support agent. Your responses should be:

1. **Concise and clear** - Get to the point quickly while remaining friendly
2. **Empathetic** - Acknowledge the customer's concern before addressing it
3. **Honest** - Never invent order details, tracking numbers, or information you don't have
4. **Helpful** - Provide actionable next steps when possible

IMPORTANT RULES:
- If you don't have specific information about an order, account, or transaction, say so and offer to look into it
- If the issue is complex, technical, or requires actions you cannot take, escalate by saying a team member will follow up
- Never make up policies, prices, or dates
- Keep responses under 150 words unless the situation requires more detail
- Use a warm but professional tone
- Sign off with a friendly closing but don't use your name

Format your response as a complete email reply ready to send to the customer.`;

interface TicketContext {
  subject?: string;
  customerName?: string;
  customerEmail: string;
  latestMessage: string;
  previousMessages?: string[];
}

async function generateReply(context: TicketContext): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const anthropic = new Anthropic({ apiKey });

  let userMessage = '';
  
  if (context.subject) {
    userMessage += `**Ticket Subject:** ${context.subject}\n\n`;
  }
  
  if (context.customerName) {
    userMessage += `**Customer Name:** ${context.customerName}\n`;
  }
  userMessage += `**Customer Email:** ${context.customerEmail}\n\n`;
  
  if (context.previousMessages && context.previousMessages.length > 0) {
    userMessage += `**Previous conversation:**\n`;
    context.previousMessages.forEach((msg, i) => {
      userMessage += `${i + 1}. ${msg}\n`;
    });
    userMessage += '\n';
  }
  
  userMessage += `**Customer's latest message:**\n${context.latestMessage}\n\n`;
  userMessage += `Please write a helpful reply to this customer.`;

  console.log('[AI] Generating reply with Claude claude-sonnet-4-6...');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }

  console.log('[AI] Reply generated successfully');
  return textBlock.text;
}

// ============================================================================
// Webhook Verification
// ============================================================================

async function verifyGorgiasWebhook(
  body: string,
  signature: string | null
): Promise<boolean> {
  const secret = Deno.env.get('GORGIAS_WEBHOOK_SECRET');
  
  if (!secret) {
    console.warn('[Webhook] No GORGIAS_WEBHOOK_SECRET configured - skipping signature verification');
    return true;
  }

  if (!signature) {
    console.error('[Webhook] Missing X-Gorgias-Signature header');
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(body);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const sigBytes = encoder.encode(signature.toLowerCase());
    const expectedBytes = encoder.encode(expectedSignature.toLowerCase());
    
    if (sigBytes.length !== expectedBytes.length) {
      console.error('[Webhook] Signature length mismatch');
      return false;
    }

    let match = true;
    for (let i = 0; i < sigBytes.length; i++) {
      if (sigBytes[i] !== expectedBytes[i]) {
        match = false;
      }
    }

    if (!match) {
      console.error('[Webhook] Invalid signature');
    }
    
    return match;
  } catch (error) {
    console.error('[Webhook] Signature verification error:', error);
    return false;
  }
}

// ============================================================================
// Request Handlers
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-gorgias-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function processTicket(ticketId: number): Promise<{ success: boolean; message: string }> {
  console.log(`[Webhook] Processing ticket ${ticketId}`);
  
  const gorgias = new GorgiasClient();
  const autoSend = Deno.env.get('AUTO_SEND')?.toLowerCase() === 'true';

  const ticket: GorgiasTicket = await gorgias.getTicket(ticketId);
  console.log(`[Webhook] Fetched ticket: "${ticket.subject || 'No subject'}" from ${ticket.customer.email}`);

  const customerMessages = ticket.messages
    .filter(m => !m.from_agent)
    .sort((a, b) => new Date(b.created_datetime).getTime() - new Date(a.created_datetime).getTime());

  if (customerMessages.length === 0) {
    console.log('[Webhook] No customer messages found, skipping');
    return { success: true, message: 'No customer messages to respond to' };
  }

  const latestMessage = customerMessages[0];
  const messageText = latestMessage.body_text || 
    latestMessage.body_html?.replace(/<[^>]*>/g, '') || 
    '';

  if (!messageText.trim()) {
    console.log('[Webhook] Empty message content, skipping');
    return { success: true, message: 'Empty message content' };
  }

  const previousMessages = ticket.messages
    .slice(0, 5)
    .map(m => {
      const text = m.body_text || m.body_html?.replace(/<[^>]*>/g, '') || '';
      const sender = m.from_agent ? 'Agent' : 'Customer';
      return `[${sender}]: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`;
    });

  console.log('[Webhook] Generating AI reply...');
  const aiReply = await generateReply({
    subject: ticket.subject,
    customerName: ticket.customer.name,
    customerEmail: ticket.customer.email,
    latestMessage: messageText,
    previousMessages: previousMessages.slice(1),
  });

  const currentUser = await gorgias.getCurrentUser();
  console.log(`[Webhook] Posting reply as ${currentUser.email}`);

  const replyHtml = aiReply
    .split('\n')
    .map(line => line.trim() ? `<p>${line}</p>` : '<br>')
    .join('');

  if (autoSend) {
    console.log('[Webhook] AUTO_SEND enabled - sending email reply');
    await gorgias.postMessage(ticketId, {
      bodyHtml: replyHtml,
      senderId: currentUser.id,
      receiverEmail: ticket.customer.email,
      isInternal: false,
    });
    return { success: true, message: 'AI reply sent to customer' };
  } else {
    console.log('[Webhook] Draft mode - saving as internal note');
    
    const draftNote = `
      <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; border-left: 4px solid #0284c7;">
        <p style="margin: 0 0 8px 0; font-weight: bold; color: #0284c7;">🤖 AI-Generated Draft Reply</p>
        <p style="margin: 0 0 16px 0; font-size: 12px; color: #64748b;">Review and edit before sending to customer</p>
        <div style="background: white; padding: 12px; border-radius: 4px;">
          ${replyHtml}
        </div>
      </div>
    `;
    
    await gorgias.postMessage(ticketId, {
      bodyHtml: draftNote,
      senderId: currentUser.id,
      receiverEmail: ticket.customer.email,
      isInternal: true,
    });
    
    await gorgias.addTag(ticketId, 'ai-draft-ready');
    
    return { success: true, message: 'AI draft saved for human review' };
  }
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('X-Gorgias-Signature');

    const isValid = await verifyGorgiasWebhook(body, signature);
    if (!isValid) {
      console.error('[Webhook] Invalid webhook signature');
      return jsonResponse({ error: 'Invalid signature' }, 401);
    }

    const payload: WebhookPayload = JSON.parse(body);
    console.log(`[Webhook] Received event: ${payload.event}`);

    if (payload.event !== 'ticket-created') {
      console.log(`[Webhook] Ignoring event type: ${payload.event}`);
      return jsonResponse({ message: `Event ${payload.event} ignored` });
    }

    const ticketId = payload.ticket_id || payload.ticket?.id;
    if (!ticketId) {
      console.error('[Webhook] No ticket ID in payload');
      return jsonResponse({ error: 'No ticket ID provided' }, 400);
    }

    const result = await processTicket(ticketId);
    console.log(`[Webhook] Completed: ${result.message}`);
    
    return jsonResponse(result);
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
});
