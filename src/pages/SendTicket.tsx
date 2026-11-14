import { useState, useEffect } from 'react';
import { Send, Mail, Users, UserPlus, FileText, AlertCircle, CheckCircle, Clock, ArrowLeft, User, Trash2, Flag, Info, History } from 'lucide-react';
import { Link } from 'react-router';
import { supabase } from '@/integrations/supabase/client';
import RichTextEditor from '@/components/RichTextEditor';

interface SendHistory {
  id: string;
  to: number;
  cc: number;
  bcc: number;
  subject: string;
  status: 'success' | 'error';
  ticketId?: number;
  ticketIds?: number[];
  batches?: number;
  error?: string;
  timestamp: Date;
}

export default function SendTicket() {
  const parseEmails = (input: string): string[] => {
    return input.
    split(/[,\n]+/).
    map((email) => email.trim().toLowerCase()).
    filter((email) => email.length > 0);
  };

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');

  // Load saved values from localStorage on mount
  useEffect(() => {
    const savedTo = localStorage.getItem('sendTicket_to');
    const savedFromName = localStorage.getItem('sendTicket_fromName');
    const savedFromEmail = localStorage.getItem('sendTicket_fromEmail');
    const savedBodyHtml = localStorage.getItem('sendTicket_bodyHtml');
    const savedBodyText = localStorage.getItem('sendTicket_bodyText');
    const savedPriority = localStorage.getItem('sendTicket_priority') as 'low' | 'normal' | 'high' | 'critical' | null;

    if (savedTo) setTo(savedTo);
    if (savedFromName) setFromName(savedFromName);
    if (savedFromEmail) setFromEmail(savedFromEmail);
    if (savedBodyHtml) {
      setBodyHtml(savedBodyHtml);
      setBodyText(savedBodyText || '');
    }
    // Handle old 'urgent' value from localStorage
    if (savedPriority === 'urgent' as unknown) {
      setPriority('critical');
      localStorage.setItem('sendTicket_priority', 'critical');
    } else if (savedPriority) {
      setPriority(savedPriority);
    }
  }, []);

  // Save values to localStorage when they change
  useEffect(() => {
    localStorage.setItem('sendTicket_to', to);
  }, [to]);

  useEffect(() => {
    localStorage.setItem('sendTicket_fromName', fromName);
  }, [fromName]);

  useEffect(() => {
    localStorage.setItem('sendTicket_fromEmail', fromEmail);
  }, [fromEmail]);

  useEffect(() => {
    localStorage.setItem('sendTicket_bodyHtml', bodyHtml);
    localStorage.setItem('sendTicket_bodyText', bodyText);
  }, [bodyHtml, bodyText]);

  useEffect(() => {
    localStorage.setItem('sendTicket_priority', priority);
  }, [priority]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    partialSuccess?: boolean;
    message: string;
    ticketId?: number;
    ticketIds?: number[];
    batches?: number;
    completedBatches?: number;
    failedAtBatch?: number;
    sentCount?: number;
    unsentCount?: number;
    unsentEmails?: string[];
    error?: string;
  } | null>(null);
  const [history, setHistory] = useState<SendHistory[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    const toEmails = parseEmails(to);
    if (toEmails.length === 0) {
      newErrors.to = 'At least one recipient is required';
    } else {
      const invalidTo = toEmails.filter((e) => !validateEmail(e));
      if (invalidTo.length > 0) {
        newErrors.to = `Invalid email(s): ${invalidTo.join(', ')}`;
      }
    }

    const ccEmails = parseEmails(cc);
    if (ccEmails.length > 0) {
      const invalidCc = ccEmails.filter((e) => !validateEmail(e));
      if (invalidCc.length > 0) {
        newErrors.cc = `Invalid email(s): ${invalidCc.join(', ')}`;
      }
    }

    const bccEmails = parseEmails(bcc);
    if (bccEmails.length > 0) {
      const invalidBcc = bccEmails.filter((e) => !validateEmail(e));
      if (invalidBcc.length > 0) {
        newErrors.bcc = `Invalid email(s): ${invalidBcc.join(', ')}`;
      }
    }

    if (!subject.trim()) {
      newErrors.subject = 'Subject is required';
    }

    if (!bodyText.trim()) {
      newErrors.body = 'Message body is required';
    }

    if (fromEmail.trim() && !validateEmail(fromEmail.trim())) {
      newErrors.fromEmail = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const [loadingLast, setLoadingLast] = useState(false);
  const [loadTicketId, setLoadTicketId] = useState('');
  const [loadMessage, setLoadMessage] = useState<{type: 'success' | 'error';text: string;} | null>(null);

  const handleLoadLastSent = async () => {
    if (!supabase) {
      setLoadMessage({ type: 'error', text: 'Cloud Backend not configured' });
      return;
    }
    if (bodyText.trim() && !window.confirm('Replace the current message with the last sent email?')) return;

    setLoadingLast(true);
    setLoadMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('get-last-ticket', {
        body: { ticketId: loadTicketId.trim() || undefined }
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Could not load the email');

      let text = data.bodyText || '';
      if (!text.trim()) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = data.bodyHtml;
        text = tempDiv.textContent || '';
      }
      setBodyHtml(data.bodyHtml);
      setBodyText(text);
      if (data.subject) setSubject(data.subject);
      setLoadMessage({
        type: 'success',
        text: `Loaded from ticket #${data.ticketId}${data.sentAt ? ` (sent ${new Date(data.sentAt).toLocaleString()})` : ''}`
      });
    } catch (err) {
      setLoadMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load last sent email' });
    } finally {
      setLoadingLast(false);
    }
  };

  const handleBodyChange = (html: string, text: string) => {
    setBodyHtml(html);
    setBodyText(text);
  };

  const clearForm = () => {
    setTo('');
    setCc('');
    setBcc('');
    setSubject('');
    setFromName('');
    setFromEmail('');
    setBodyHtml('');
    setBodyText('');
    setResult(null);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;
    if (!supabase) {
      setResult({ success: false, message: 'Cloud Backend not configured' });
      return;
    }

    setLoading(true);
    setResult(null);

    const toEmails = parseEmails(to);
    const ccEmails = parseEmails(cc);
    const bccEmails = parseEmails(bcc);

    try {
      const { data, error } = await supabase.functions.invoke('send-ticket', {
        body: {
          to: toEmails,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          bcc: bccEmails.length > 0 ? bccEmails : undefined,
          subject: subject.trim(),
          fromName: fromName.trim() || undefined,
          fromEmail: fromEmail.trim() || undefined,
          bodyHtml: bodyHtml,
          bodyText: bodyText.trim(),
          priority: priority
        }
      });

      if (error) {
        console.error('Supabase error:', error);
        throw new Error(error.message || JSON.stringify(error));
      }

      if (data.success) {
        setResult({
          success: true,
          message: data.message,
          ticketId: data.ticketId,
          ticketIds: data.ticketIds,
          batches: data.batches,
          completedBatches: data.completedBatches,
          sentCount: data.sentCount
        });

        // Add to history
        setHistory((prev) => [{
          id: crypto.randomUUID(),
          to: toEmails.length,
          cc: ccEmails.length,
          bcc: bccEmails.length,
          subject: subject.trim(),
          status: 'success',
          ticketId: data.ticketId,
          ticketIds: data.ticketIds,
          batches: data.batches,
          timestamp: new Date()
        }, ...prev]);
      } else if (data.partialSuccess) {
        // Partial success - some batches sent, some failed
        setResult({
          success: false,
          partialSuccess: true,
          message: data.message,
          ticketId: data.ticketId,
          ticketIds: data.ticketIds,
          batches: data.batches,
          completedBatches: data.completedBatches,
          failedAtBatch: data.failedAtBatch,
          sentCount: data.sentCount,
          unsentCount: data.unsentCount,
          unsentEmails: data.unsentEmails,
          error: data.error
        });

        // Add to history as partial
        setHistory((prev) => [{
          id: crypto.randomUUID(),
          to: toEmails.length,
          cc: ccEmails.length,
          bcc: bccEmails.length,
          subject: subject.trim(),
          status: 'error',
          ticketId: data.ticketId,
          ticketIds: data.ticketIds,
          batches: data.batches,
          error: `Partial: ${data.completedBatches}/${data.batches} batches`,
          timestamp: new Date()
        }, ...prev]);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Send ticket error:', err);
      let errorMessage = 'Failed to send ticket';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = JSON.stringify(err);
      }
      setResult({ success: false, message: errorMessage });

      // Add to history
      setHistory((prev) => [{
        id: crypto.randomUUID(),
        to: toEmails.length,
        cc: ccEmails.length,
        bcc: bccEmails.length,
        subject: subject.trim(),
        status: 'error',
        error: errorMessage,
        timestamp: new Date()
      }, ...prev]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-ev-id="ev_cdbd99d763" className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header data-ev-id="ev_11e7a7b7c4" className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div data-ev-id="ev_50e83a0026" className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link data-ev-id="ev_9c0ef23393" to="/dashboard" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div data-ev-id="ev_82fb2c074b" className="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg">
            <Send className="w-6 h-6 text-white" />
          </div>
          <div data-ev-id="ev_9df3514838">
            <h1 data-ev-id="ev_4c279aa7ac" className="text-xl font-bold">Send Ticket</h1>
            <p data-ev-id="ev_66f3d94bfe" className="text-sm text-slate-400">Create a support ticket and send outbound email</p>
          </div>
        </div>
      </header>

      <main data-ev-id="ev_81d98bc03a" className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Form */}
        <form data-ev-id="ev_bef696aac4" onSubmit={handleSubmit} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div data-ev-id="ev_8b0221e326" className="px-6 py-4 border-b border-slate-800">
            <h2 data-ev-id="ev_28d5594c1c" className="text-lg font-semibold">New Outbound Email</h2>
          </div>
          
          <div data-ev-id="ev_33a1826932" className="p-6 flex flex-col gap-5">
            {/* To Field */}
            <div data-ev-id="ev_eefb85a000" className="flex flex-col gap-2">
              <label data-ev-id="ev_69929ab17a" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <Mail className="w-4 h-4" />
                To <span data-ev-id="ev_9482a2bab6" className="text-red-400">*</span>
              </label>
              <textarea data-ev-id="ev_727b355867"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com, another@example.com"
              rows={2}
              className={`px-4 py-3 bg-slate-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none ${
              errors.to ? 'border-red-500' : 'border-slate-700'}`
              } />

              {errors.to && <p data-ev-id="ev_9f24fa3ef1" className="text-sm text-red-400 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{errors.to}</p>}
              <p data-ev-id="ev_466450140f" className="text-xs text-slate-500">Separate multiple emails with commas or new lines</p>
            </div>

            {/* CC Field */}
            <div data-ev-id="ev_baece9cb7c" className="flex flex-col gap-2">
              <label data-ev-id="ev_7ab0cb2040" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <Users className="w-4 h-4" />
                CC <span data-ev-id="ev_cd1cc5d093" className="text-slate-500">(optional)</span>
              </label>
              <textarea data-ev-id="ev_f87d3faf24"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com, another@example.com"
              rows={2}
              className={`px-4 py-3 bg-slate-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none ${
              errors.cc ? 'border-red-500' : 'border-slate-700'}`
              } />

              {errors.cc && <p data-ev-id="ev_47eb55a0dd" className="text-sm text-red-400 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{errors.cc}</p>}
              <p data-ev-id="ev_bcd4c7cd90" className="text-xs text-slate-500">Separate multiple emails with commas or new lines</p>
            </div>

            {/* BCC Field */}
            <div data-ev-id="ev_01aba9c9ee" className="flex flex-col gap-2">
              <label data-ev-id="ev_0834c69667" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <UserPlus className="w-4 h-4" />
                BCC <span data-ev-id="ev_b27122e4a6" className="text-slate-500">(optional)</span>
              </label>
              <textarea data-ev-id="ev_6b139f8a5b"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="bcc@example.com, another@example.com"
              rows={2}
              className={`px-4 py-3 bg-slate-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none ${
              errors.bcc ? 'border-red-500' : 'border-slate-700'}`
              } />

              {errors.bcc && <p data-ev-id="ev_7867f232d5" className="text-sm text-red-400 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{errors.bcc}</p>}
              <p data-ev-id="ev_e91187f115" className="text-xs text-slate-500">Separate multiple emails with commas or new lines</p>
            </div>

            {/* Subject Field */}
            <div data-ev-id="ev_3b76150ed4" className="flex flex-col gap-2">
              <label data-ev-id="ev_a29bf2fbe8" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <FileText className="w-4 h-4" />
                Subject <span data-ev-id="ev_a174a3cb4c" className="text-red-400">*</span>
              </label>
              <input data-ev-id="ev_1e907e4194"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line"
              className={`px-4 py-3 bg-slate-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
              errors.subject ? 'border-red-500' : 'border-slate-700'}`
              } />

              {errors.subject && <p data-ev-id="ev_0e601f33d5" className="text-sm text-red-400 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{errors.subject}</p>}
            </div>

            {/* From Email Field */}
            <div data-ev-id="ev_from_email" className="flex flex-col gap-2">
              <label data-ev-id="ev_f0934e0fc6" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <Mail className="w-4 h-4" />
                From Email <span data-ev-id="ev_34218f3ba3" className="text-slate-500">(optional)</span>
              </label>
              <input data-ev-id="ev_6443cf1484"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="support@yourdomain.com"
              className={`px-4 py-3 bg-slate-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
              errors.fromEmail ? 'border-red-500' : 'border-slate-700'}`
              } />

              {errors.fromEmail && <p data-ev-id="ev_e9945eaedc" className="text-sm text-red-400 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{errors.fromEmail}</p>}
              <p data-ev-id="ev_b4e9b1058d" className="text-xs text-slate-500">Sender email address. Uses default if empty.</p>
            </div>

            {/* From Name Field */}
            <div data-ev-id="ev_a0144f8393" className="flex flex-col gap-2">
              <label data-ev-id="ev_b7914a3885" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <User className="w-4 h-4" />
                From Name <span data-ev-id="ev_49388c088d" className="text-slate-500">(optional)</span>
              </label>
              <input data-ev-id="ev_ead49ee422"
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="e.g., Support Team, John from Sales"
              className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />

              <p data-ev-id="ev_1b536aa571" className="text-xs text-slate-500">Display name shown to recipients. Uses default if empty.</p>
            </div>

            {/* Priority Field */}
            <div data-ev-id="ev_priority_field" className="flex flex-col gap-2">
              <label data-ev-id="ev_priority_label" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <Flag className="w-4 h-4" />
                Priority
              </label>
              <select
                data-ev-id="ev_priority_select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'critical')}
                className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">

                <option data-ev-id="ev_d80a134678" value="low">Low</option>
                <option data-ev-id="ev_ccada985ae" value="normal">Normal</option>
                <option data-ev-id="ev_269b81ffb3" value="high">High</option>
                <option data-ev-id="ev_00a7fa1f16" value="critical">Critical</option>
              </select>
            </div>

            {/* Body Field - Rich Text Editor */}
            <div data-ev-id="ev_0a860d778e" className="flex flex-col gap-2">
              <div data-ev-id="ev_a3f2c3fbb7" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <label data-ev-id="ev_6ca2ffd5f7" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  Message Body <span data-ev-id="ev_3b2764ce33" className="text-red-400">*</span>
                </label>
                <div data-ev-id="ev_62f00e527b" className="flex items-center gap-2">
                  <input data-ev-id="ev_d09a9be252"
                  type="text"
                  inputMode="numeric"
                  value={loadTicketId}
                  onChange={(e) => setLoadTicketId(e.target.value)}
                  placeholder="Ticket ID (optional)"
                  className="w-40 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                  <button data-ev-id="ev_cb9da0e3d0"
                  type="button"
                  onClick={handleLoadLastSent}
                  disabled={loadingLast || loading}
                  className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap">
                    {loadingLast ?
                    <div data-ev-id="ev_55919bcc61" className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
                    <History className="w-4 h-4" />
                    }
                    Load last sent
                  </button>
                </div>
              </div>
              {loadMessage &&
              <p data-ev-id="ev_d90ff6c486" className={`text-sm flex items-center gap-1 ${loadMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {loadMessage.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  {loadMessage.text}
                </p>
              }
              <div data-ev-id="ev_personalization_hint" className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <div data-ev-id="ev_0ecc6fc67d" className="text-xs text-slate-400">
                  <p data-ev-id="ev_49195c8620" className="font-medium text-slate-300 mb-1">Personalization Tokens</p>
                  <p data-ev-id="ev_da5b1beca6">Use these tokens to personalize your message:</p>
                  <code data-ev-id="ev_faa4b7a958" className="block mt-1 text-blue-400 bg-slate-900 px-2 py-1 rounded">
                    {`{{ticket.customer.email}}`} • {`{{ticket.customer.firstname}}`} • {`{{ticket.customer.lastname}}`}
                  </code>
                </div>
              </div>
              <RichTextEditor
                value={bodyHtml}
                onChange={handleBodyChange}
                placeholder="Write your message here..."
                error={!!errors.body} />

              {errors.body && <p data-ev-id="ev_91d808db26" className="text-sm text-red-400 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{errors.body}</p>}
            </div>

            {/* Result Message */}
            {result &&
            <div data-ev-id="ev_cb76d5510d" className={`p-4 rounded-lg flex flex-col gap-3 ${
            result.success ?
            'bg-emerald-500/10 border border-emerald-500/30' :
            result.partialSuccess ?
            'bg-amber-500/10 border border-amber-500/30' :
            'bg-red-500/10 border border-red-500/30'}`
            }>
                <div data-ev-id="ev_b9f9852bdd" className="flex items-start gap-3">
                  {result.success ?
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" /> :
                result.partialSuccess ?
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" /> :

                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                }
                  <div data-ev-id="ev_7e9e1eb62d" className="flex-1">
                    <p data-ev-id="ev_d632c0e488" className={result.success ? 'text-emerald-400' : result.partialSuccess ? 'text-amber-400' : 'text-red-400'}>
                      {result.message}
                    </p>
                    {result.batches && result.batches > 1 && result.ticketIds && result.ticketIds.length > 0 &&
                  <p data-ev-id="ev_60aa3ed014" className="text-sm text-slate-400 mt-1">
                        Tickets created: {result.ticketIds.map((id) =>
                    <span data-ev-id="ev_c245c2c92b" key={id} className="font-mono text-emerald-400 mr-2">#{id}</span>
                    )}
                      </p>
                  }
                    {!result.batches && result.ticketId &&
                  <p data-ev-id="ev_58550f649a" className="text-sm text-slate-400 mt-1">
                        Ticket ID: <span data-ev-id="ev_89162a1561" className="font-mono text-emerald-400">#{result.ticketId}</span>
                      </p>
                  }
                  </div>
                </div>
                
                {/* Partial Success - Show unsent emails */}
                {result.partialSuccess && result.unsentEmails && result.unsentEmails.length > 0 &&
              <div data-ev-id="ev_c8c0a27410" className="mt-2 p-3 bg-slate-800/50 rounded-lg">
                    <div data-ev-id="ev_1ab63064ba" className="flex items-center justify-between mb-2">
                      <p data-ev-id="ev_cac912353c" className="text-sm font-medium text-amber-400">
                        {result.unsentCount} unsent emails (failed at batch {result.failedAtBatch})
                      </p>
                      <button data-ev-id="ev_2696734281"
                  type="button"
                  onClick={() => {
                    setBcc(result.unsentEmails!.join('\n'));
                    setResult(null);
                  }}
                  className="px-3 py-1 text-sm bg-amber-600 hover:bg-amber-500 rounded font-medium transition-colors">

                        Retry Unsent
                      </button>
                    </div>
                    <p data-ev-id="ev_2b5a79acab" className="text-xs text-slate-500 mb-1">Click "Retry Unsent" to load these into BCC and try again:</p>
                    <div data-ev-id="ev_45a5618d73" className="max-h-32 overflow-y-auto text-xs text-slate-400 font-mono bg-slate-900 p-2 rounded">
                      {result.unsentEmails.slice(0, 50).join(', ')}
                      {result.unsentEmails.length > 50 && ` ... and ${result.unsentEmails.length - 50} more`}
                    </div>
                  </div>
              }
              </div>
            }

            {/* Action Buttons */}
            <div data-ev-id="ev_a6b60b7414" className="mt-2 flex gap-3">
              <button data-ev-id="ev_315efee38d"
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">

              {loading ?
                <>
                  <div data-ev-id="ev_092ef3251f" className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </> :

                <>
                  <Send className="w-5 h-5" />
                  Send Ticket
                </>
                }
              </button>
              <button data-ev-id="ev_4e00c34272"
              type="button"
              onClick={clearForm}
              disabled={loading}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">

                <Trash2 className="w-5 h-5" />
                Clear
              </button>
            </div>
          </div>
        </form>

        {/* History */}
        {history.length > 0 &&
        <section data-ev-id="ev_c261a67fee" className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div data-ev-id="ev_932479d492" className="px-6 py-4 border-b border-slate-800">
              <h2 data-ev-id="ev_51238f42c4" className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-400" />
                Send History
              </h2>
              <p data-ev-id="ev_d27572e106" className="text-sm text-slate-400 mt-1">Session only — clears on page refresh</p>
            </div>
            <div data-ev-id="ev_2ac6d6b801" className="overflow-x-auto">
              <table data-ev-id="ev_104ba36cb4" className="w-full">
                <thead data-ev-id="ev_f17c89c36d">
                  <tr data-ev-id="ev_bc4e1b976b" className="text-left text-sm text-slate-400 border-b border-slate-800">
                    <th data-ev-id="ev_3fd2f49696" className="px-6 py-3 font-medium">Status</th>
                    <th data-ev-id="ev_c6d39f5128" className="px-6 py-3 font-medium">Subject</th>
                    <th data-ev-id="ev_9d36aa3f34" className="px-6 py-3 font-medium">To</th>
                    <th data-ev-id="ev_f8fc3700ca" className="px-6 py-3 font-medium">CC</th>
                    <th data-ev-id="ev_4a67e6dcad" className="px-6 py-3 font-medium">BCC</th>
                    <th data-ev-id="ev_1d737a28cb" className="px-6 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody data-ev-id="ev_9e4dcfc77a">
                  {history.map((item) =>
                <tr data-ev-id="ev_fffa163bd7" key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td data-ev-id="ev_638d3d043d" className="px-6 py-4">
                        {item.status === 'success' ?
                    item.batches && item.batches > 1 ?
                    <span data-ev-id="ev_58cd09deb0" className="inline-flex items-center gap-1 text-sm text-emerald-400">
                              <CheckCircle className="w-4 h-4" />
                              {item.batches} batches
                            </span> :

                    <span data-ev-id="ev_06a200b2fa" className="inline-flex items-center gap-1 text-sm text-emerald-400">
                              <CheckCircle className="w-4 h-4" />
                              #{item.ticketId}
                            </span> :


                    <span data-ev-id="ev_093c8b571d" className="inline-flex items-center gap-1 text-sm text-red-400">
                            <AlertCircle className="w-4 h-4" />
                            Failed
                          </span>
                    }
                      </td>
                      <td data-ev-id="ev_0d74492152" className="px-6 py-4 text-sm max-w-[200px] truncate">{item.subject}</td>
                      <td data-ev-id="ev_ed2244c2c4" className="px-6 py-4 text-sm text-slate-300">{item.to}</td>
                      <td data-ev-id="ev_6bea1229d1" className="px-6 py-4 text-sm text-slate-400">{item.cc || '-'}</td>
                      <td data-ev-id="ev_db1992afb0" className="px-6 py-4 text-sm text-slate-400">{item.bcc || '-'}</td>
                      <td data-ev-id="ev_60efb4bfa0" className="px-6 py-4 text-sm text-slate-400">
                        {item.timestamp.toLocaleTimeString()}
                      </td>
                    </tr>
                )}
                </tbody>
              </table>
            </div>
          </section>
        }
      </main>
    </div>);

}