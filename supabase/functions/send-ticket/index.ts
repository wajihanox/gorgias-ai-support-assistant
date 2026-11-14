/**
 * Send Ticket Edge Function
 * 
 * Creates a Gorgias support ticket and sends an outbound email
 * with To, CC, and BCC recipients. Supports HTML body with sanitization.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Allowed HTML tags for email-safe sanitization
const ALLOWED_TAGS = new Set([
  'p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'table', 'tr', 'td', 'th', 
  'tbody', 'thead', 'tfoot', 'img', 'hr', 'blockquote', 'pre', 'code',
  'center', 'font', 'small', 'big', 'sub', 'sup'
]);

// Allowed attributes per tag - expanded for email templates
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['style', 'class', 'id']), // Global attributes
  'a': new Set(['href', 'target', 'rel', 'title']),
  'img': new Set(['src', 'alt', 'width', 'height', 'border']),
  'table': new Set(['width', 'height', 'cellpadding', 'cellspacing', 'border', 'align', 'bgcolor', 'role']),
  'tr': new Set(['align', 'valign', 'bgcolor']),
  'td': new Set(['width', 'height', 'align', 'valign', 'bgcolor', 'colspan', 'rowspan']),
  'th': new Set(['width', 'height', 'align', 'valign', 'bgcolor', 'colspan', 'rowspan', 'scope']),
  'tbody': new Set(['align', 'valign']),
  'thead': new Set(['align', 'valign']),
  'tfoot': new Set(['align', 'valign']),
  'font': new Set(['color', 'face', 'size']),
  'div': new Set(['align']),
  'p': new Set(['align']),
  'h1': new Set(['align']),
  'h2': new Set(['align']),
  'h3': new Set(['align']),
  'h4': new Set(['align']),
  'h5': new Set(['align']),
  'h6': new Set(['align']),
  'hr': new Set(['width', 'size', 'color', 'noshade']),
  'blockquote': new Set(['cite']),
};

interface SendTicketRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  fromName?: string;
  fromEmail?: string;
  bodyHtml: string;
  bodyText: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

/**
 * Replace personalization tokens in text
 * Supported tokens:
 * - {{ticket.customer.email}} - recipient email
 * - {{ticket.customer.name}} - full name (extracted from email)
 * - {{ticket.customer.firstname}} - first name
 * - {{ticket.customer.lastname}} - last name
 */
function replacePersonalizationTokens(text: string, recipientEmail: string): string {
  // Extract name from email (part before @)
  const emailName = recipientEmail.split('@')[0] || '';
  
  // Try to extract first and last name from email
  // Handle formats like: john.doe, john_doe, johndoe
  const nameParts = emailName.split(/[._-]/).filter(p => p.length > 0);
  const firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase() : '';
  const lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1).toLowerCase() : '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  return text
    .replace(/\{\{ticket\.customer\.email\}\}/gi, recipientEmail)
    .replace(/\{\{ticket\.customer\.name\}\}/gi, fullName)
    .replace(/\{\{ticket\.customer\.firstname\}\}/gi, firstName)
    .replace(/\{\{ticket\.customer\.lastname\}\}/gi, lastName);
}

// Max total recipients per message - Gorgias limits to 15 recipients per message
const MAX_RECIPIENTS_PER_MESSAGE = 15;

interface GorgiasTicketResponse {
  id: number;
  uri: string;
}

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

/**
 * HTML sanitizer for email-safe content
 * - Allows email-safe tags and attributes
 * - Forces rel="noopener noreferrer" on links
 * - Validates href and src URLs
 * - Strips event handlers and dangerous content
 */
function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  
  // Remove style tags and their content (inline styles are kept)
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML comments
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove event handlers (on* attributes)
  html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
  
  // Process tags
  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (match, closing, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    
    // Remove disallowed tags entirely
    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }
    
    if (closing) {
      return `</${tag}>`;
    }
    
    // Get allowed attributes for this tag (including global attrs)
    const tagAttrs = ALLOWED_ATTRS[tag] || new Set();
    const globalAttrs = ALLOWED_ATTRS['*'] || new Set();
    const allowedAttrs = new Set([...tagAttrs, ...globalAttrs]);
    
    let cleanAttrs = '';
    
    // Extract attributes
    const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let attrMatch;
    
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      
      // Skip disallowed attributes and event handlers
      if (!allowedAttrs.has(attrName) || attrName.startsWith('on')) {
        continue;
      }
      
      // Validate href and src - allow http, https, mailto, tel
      if (attrName === 'href') {
        if (!attrValue.match(/^(https?:\/\/|mailto:|tel:)/i)) {
          continue;
        }
      }
      
      if (attrName === 'src') {
        if (!attrValue.match(/^https?:\/\//i)) {
          continue;
        }
      }
      
      // Sanitize style attribute - remove expressions and dangerous content
      if (attrName === 'style') {
        const safeStyle = attrValue
          .replace(/expression\s*\([^)]*\)/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/behavior\s*:/gi, '')
          .replace(/-moz-binding\s*:/gi, '')
          .replace(/url\s*\([^)]*script[^)]*\)/gi, '');
        cleanAttrs += ` style="${safeStyle}"`;
        continue;
      }
      
      cleanAttrs += ` ${attrName}="${attrValue}"`;
    }
    
    // Force rel="noopener noreferrer" on links
    if (tag === 'a') {
      if (!cleanAttrs.includes('rel=')) {
        cleanAttrs += ' rel="noopener noreferrer"';
      }
    }
    
    // Handle self-closing tags
    if (tag === 'br' || tag === 'img' || tag === 'hr') {
      return `<${tag}${cleanAttrs}>`;
    }
    
    return `<${tag}${cleanAttrs}>`;
  });
  
  return html;
}

/**
 * Strip HTML tags to get plain text
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function gorgiasRequest<T>(
  endpoint: string,
  method: string,
  body?: unknown,
  retries = 0
): Promise<T> {
  const subdomain = Deno.env.get('GORGIAS_SUBDOMAIN');
  const email = Deno.env.get('GORGIAS_EMAIL');
  const apiKey = Deno.env.get('GORGIAS_API_KEY');

  if (!subdomain || !email || !apiKey) {
    throw new Error('Missing Gorgias configuration');
  }

  const url = `https://${subdomain}.gorgias.com/api${endpoint}`;
  const authHeader = 'Basic ' + btoa(`${email}:${apiKey}`);

  console.log(`[Gorgias] ${method} ${url}`);

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': authHeader,
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
    return gorgiasRequest<T>(endpoint, method, body, retries + 1);
  }

  const responseText = await response.text();

  if (!response.ok) {
    console.error(`[Gorgias] Error ${response.status}:`, responseText);
    throw new Error(`Gorgias API error ${response.status}: ${responseText}`);
  }

  return JSON.parse(responseText);
}

/**
 * Split an array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create a single ticket with the given recipients
 */
async function createSingleTicket(
  request: SendTicketRequest,
  bccBatch: string[] | undefined,
  sanitizedHtml: string,
  bodyText: string,
  fromAddress: string,
  fromName: string | undefined,
  senderEmail: string,
  priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'
): Promise<GorgiasTicketResponse> {
  const firstRecipient = request.to[0];
  
  // Replace personalization tokens with actual values
  const personalizedHtml = replacePersonalizationTokens(sanitizedHtml, firstRecipient);
  const personalizedText = replacePersonalizationTokens(bodyText, firstRecipient);
  const personalizedSubject = replacePersonalizationTokens(request.subject, firstRecipient);

  // Build source object with To/CC/BCC arrays
  const sourceFrom: Record<string, string> = { address: fromAddress };
  if (fromName) {
    sourceFrom.name = fromName;
  }

  const source: Record<string, unknown> = {
    type: 'email',
    from: sourceFrom,
    to: request.to.map(email => ({ address: email })),
  };

  // Only include cc/bcc if they have recipients
  if (request.cc && request.cc.length > 0) {
    source.cc = request.cc.map(email => ({ address: email }));
  }
  if (bccBatch && bccBatch.length > 0) {
    source.bcc = bccBatch.map(email => ({ address: email }));
  }

  const ticketPayload = {
    customer: { email: firstRecipient },
    channel: 'email',
    via: 'api',
    from_agent: true,
    status: 'open',
    priority: priority,
    subject: personalizedSubject,
    messages: [
      {
        channel: 'email',
        from_agent: true,
        via: 'api',
        subject: personalizedSubject,
        body_html: personalizedHtml,
        body_text: personalizedText,
        sender: { email: senderEmail },
        receiver: { email: firstRecipient },
        source,
      },
    ],
  };

  const result = await gorgiasRequest<GorgiasTicketResponse>('/tickets', 'POST', ticketPayload);
  return result;
}

/**
 * Create ticket(s) with email - automatically batches large BCC lists
 */
async function createTicketWithEmail(request: SendTicketRequest): Promise<{ tickets: GorgiasTicketResponse[], batches: number }> {
  const senderEmail = Deno.env.get('GORGIAS_SENDER_EMAIL');
  const defaultFromAddress = Deno.env.get('GORGIAS_FROM_ADDRESS');
  const defaultFromName = Deno.env.get('GORGIAS_FROM_NAME');

  if (!senderEmail || !defaultFromAddress) {
    throw new Error('Missing GORGIAS_SENDER_EMAIL or GORGIAS_FROM_ADDRESS configuration');
  }

  // Sanitize HTML and derive plain text if needed
  const sanitizedHtml = sanitizeHtml(request.bodyHtml);
  const bodyText = request.bodyText?.trim() || stripHtmlTags(sanitizedHtml);

  // Determine the from email and name (use request values, fall back to env defaults)
  const fromAddress = request.fromEmail?.trim() || defaultFromAddress;
  const fromName = request.fromName?.trim() || defaultFromName;

  console.log(`[SendTicket] Sanitized HTML length: ${sanitizedHtml.length}, Plain text length: ${bodyText.length}`);
  console.log(`[SendTicket] From address: ${fromAddress}`);
  if (fromName) {
    console.log(`[SendTicket] From name: ${fromName}`);
  }

  const tickets: GorgiasTicketResponse[] = [];
  
  // Calculate max BCC per batch (15 total minus To and CC recipients)
  const toCount = request.to.length;
  const ccCount = request.cc?.length || 0;
  const maxBccPerBatch = MAX_RECIPIENTS_PER_MESSAGE - toCount - ccCount;
  
  if (maxBccPerBatch <= 0) {
    throw new Error(`Too many To/CC recipients. Gorgias allows max ${MAX_RECIPIENTS_PER_MESSAGE} total recipients per message.`);
  }
  
  // Check if we need to batch BCC recipients
  const totalBcc = request.bcc?.length || 0;
  
  if (totalBcc > maxBccPerBatch) {
    // Split BCC into batches
    const bccBatches = chunkArray(request.bcc!, maxBccPerBatch);
    const totalBatches = bccBatches.length;
    console.log(`[SendTicket] Large BCC list (${totalBcc}) - splitting into ${totalBatches} batches of ${maxBccPerBatch} (To=${toCount}, CC=${ccCount})`);
    
    const sentEmails: string[] = [];
    const unsentEmails: string[] = [];
    let failedAtBatch: number | null = null;
    let failureError: string | null = null;
    
    for (let i = 0; i < bccBatches.length; i++) {
      const bccBatch = bccBatches[i];
      console.log(`[SendTicket] Creating ticket batch ${i + 1}/${totalBatches} with ${bccBatch.length} BCC recipients...`);
      
      try {
        const result = await createSingleTicket(
          request,
          bccBatch,
          sanitizedHtml,
          bodyText,
          fromAddress,
          fromName,
          senderEmail,
          request.priority || 'normal'
        );
        
        console.log(`[SendTicket] Batch ${i + 1} ticket created: ID ${result.id}`);
        tickets.push(result);
        sentEmails.push(...bccBatch);
      } catch (error) {
        // Record failure and remaining unsent emails
        failedAtBatch = i + 1;
        failureError = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[SendTicket] Batch ${i + 1} failed: ${failureError}`);
        
        // All remaining batches are unsent
        for (let j = i; j < bccBatches.length; j++) {
          unsentEmails.push(...bccBatches[j]);
        }
        break;
      }
    }
    
    return { 
      tickets, 
      batches: totalBatches,
      completedBatches: tickets.length,
      sentEmails,
      unsentEmails,
      failedAtBatch,
      failureError
    };
  } else {
    // Single ticket - no batching needed
    console.log('[SendTicket] Creating ticket...');
    
    const result = await createSingleTicket(
      request,
      request.bcc,
      sanitizedHtml,
      bodyText,
      fromAddress,
      fromName,
      senderEmail,
      request.priority || 'normal'
    );
    
    console.log(`[SendTicket] Ticket created successfully: ID ${result.id}`);
    return { 
      tickets: [result], 
      batches: 1,
      completedBatches: 1,
      sentEmails: request.bcc || [],
      unsentEmails: [],
      failedAtBatch: null,
      failureError: null
    };
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body: SendTicketRequest = await req.json();

    // Convert old 'urgent' value to 'critical'
    if ((body.priority as string) === 'urgent') {
      body.priority = 'critical';
    }

    // Validate required fields
    if (!body.to || body.to.length === 0) {
      return jsonResponse({ error: 'At least one "To" recipient is required' }, 400);
    }

    if (!body.subject?.trim()) {
      return jsonResponse({ error: 'Subject is required' }, 400);
    }

    if (!body.bodyHtml?.trim() && !body.bodyText?.trim()) {
      return jsonResponse({ error: 'Body is required' }, 400);
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allEmails = [
      ...body.to,
      ...(body.cc || []),
      ...(body.bcc || []),
    ];

    for (const email of allEmails) {
      if (!emailRegex.test(email)) {
        return jsonResponse({ error: `Invalid email format: ${email}` }, 400);
      }
    }

    const totalRecipients = body.to.length + (body.cc?.length || 0) + (body.bcc?.length || 0);
    console.log(`[SendTicket] Sending to ${totalRecipients} total recipient(s): To=${body.to.length}, CC=${body.cc?.length || 0}, BCC=${body.bcc?.length || 0}`);

    const result = await createTicketWithEmail(body);
    const { tickets, batches, completedBatches, sentEmails, unsentEmails, failedAtBatch, failureError } = result;
    const ticketIds = tickets.map(t => t.id);

    // Check for partial failure
    if (failedAtBatch !== null) {
      return jsonResponse({
        success: false,
        partialSuccess: true,
        ticketIds,
        ticketId: ticketIds[0] || null,
        batches,
        completedBatches,
        failedAtBatch,
        sentCount: sentEmails.length,
        unsentCount: unsentEmails.length,
        unsentEmails,
        error: failureError,
        message: `Partial send: ${completedBatches}/${batches} batches completed. Failed at batch ${failedAtBatch}. ${sentEmails.length} sent, ${unsentEmails.length} unsent.`,
      });
    }

    if (batches > 1) {
      return jsonResponse({
        success: true,
        ticketIds,
        ticketId: ticketIds[0],
        batches,
        completedBatches,
        sentCount: sentEmails.length,
        message: `${batches} tickets created (#${ticketIds.join(', #')}) - sent to ${totalRecipients} recipients`,
      });
    }

    return jsonResponse({
      success: true,
      ticketId: ticketIds[0],
      message: `Ticket #${ticketIds[0]} created and email sent to ${totalRecipients} recipient(s)`,
    });
  } catch (error) {
    console.error('[SendTicket] Error:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send ticket',
      },
      500
    );
  }
});
