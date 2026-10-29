// Mailkö: allt läggs i tabellen outbox och skickas via Resend.
// Skickas direkt när det går; cron-jobbet försöker igen om något misslyckas.
import { db } from './db';
import { env } from './env';
import { EmailBlock, renderEmail, renderVars, TemplateKey, TEMPLATES } from './templates';
import { Studio } from './types';

export type Attachment = { filename: string; content: string; contentType?: string }; // content = base64

export async function loadTemplate(studioId: string, key: TemplateKey) {
  const { data } = await db()
    .from('email_templates')
    .select('subject, body')
    .eq('studio_id', studioId)
    .eq('key', key)
    .maybeSingle();
  return { subject: data?.subject ?? TEMPLATES[key].subject, body: data?.body ?? TEMPLATES[key].body };
}

export function studioFooter(studio: Studio): string {
  const lines = [studio.name];
  const contact = [studio.address, studio.email, studio.phone].filter(Boolean).join(' · ');
  if (contact) lines.push(contact);
  if (studio.org_nr) lines.push(`Org.nr ${studio.org_nr}`);
  return lines.join('\n');
}

export async function queueTemplated(opts: {
  studio: Studio;
  to: string;
  key: TemplateKey;
  vars: Record<string, string>;
  blocks: EmailBlock[];
  attachments?: Attachment[];
  dedupeKey?: string;
  sendNow?: boolean;
}) {
  const tpl = await loadTemplate(opts.studio.id, opts.key);
  const vars = { studio: opts.studio.name, ...opts.vars };
  const { html, text } = renderEmail({
    studioName: opts.studio.name,
    accent: opts.studio.accent_color,
    bodyText: renderVars(tpl.body, vars),
    blocks: opts.blocks,
    footer: studioFooter(opts.studio),
  });
  return queueRaw({
    studioId: opts.studio.id,
    fromName: opts.studio.name,
    replyTo: opts.studio.email,
    to: opts.to,
    subject: renderVars(tpl.subject, vars),
    html,
    text,
    attachments: opts.attachments,
    dedupeKey: opts.dedupeKey,
    sendNow: opts.sendNow ?? true,
  });
}

export async function queueRaw(opts: {
  studioId: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
  dedupeKey?: string;
  sendNow?: boolean;
}) {
  const row = {
    studio_id: opts.studioId,
    to_email: opts.to,
    reply_to: opts.replyTo ?? null,
    from_name: opts.fromName ?? null,
    subject: opts.subject,
    html: opts.html,
    text_body: opts.text ?? null,
    attachments: opts.attachments ?? null,
    dedupe_key: opts.dedupeKey ?? null,
  };
  const { data, error } = await db().from('outbox').insert(row).select('id').single();
  if (error) {
    // Samma dedupe_key redan köad = redan skickat. Inget fel.
    if ((error as any).code === '23505') return null;
    throw new Error('Kunde inte köa mail: ' + error.message);
  }
  if (opts.sendNow !== false) {
    try {
      await sendOutboxRow(data.id);
    } catch {
      /* cron försöker igen */
    }
  }
  return data.id as string;
}

function fromHeader(fromName: string | null): string {
  const from = env.emailFrom;
  if (!from) return '';
  // EMAIL_FROM kan vara "bokning@x.se" eller "Namn <bokning@x.se>".
  const address = from.includes('<') ? from.slice(from.indexOf('<') + 1, from.indexOf('>')) : from;
  const name = (fromName || env.platformName).replace(/["<>]/g, '');
  return `${name} <${address.trim()}>`;
}

export async function sendOutboxRow(id: string) {
  const { data: row } = await db().from('outbox').select('*').eq('id', id).maybeSingle();
  if (!row || row.sent_at) return;
  if (!env.resendApiKey || !env.emailFrom) {
    await db()
      .from('outbox')
      .update({ attempts: row.attempts + 1, last_error: 'RESEND_API_KEY eller EMAIL_FROM saknas' })
      .eq('id', id);
    return;
  }
  const payload: Record<string, unknown> = {
    from: fromHeader(row.from_name),
    to: [row.to_email],
    subject: row.subject,
    html: row.html,
  };
  if (row.text_body) payload.text = row.text_body;
  if (row.reply_to) payload.reply_to = row.reply_to;
  if (Array.isArray(row.attachments) && row.attachments.length) {
    // Resend läser filtypen från filnamnet (.ics → text/calendar).
    payload.attachments = row.attachments.map((a: Attachment) => ({ filename: a.filename, content: a.content }));
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    await db().from('outbox').update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq('id', id);
  } else {
    const msg = (await res.text()).slice(0, 500);
    await db().from('outbox').update({ attempts: row.attempts + 1, last_error: `${res.status}: ${msg}` }).eq('id', id);
    throw new Error(msg);
  }
}

/** Skickar allt som väntar i kön (anropas av cron). */
export async function processOutbox(limit = 50) {
  const { data } = await db()
    .from('outbox')
    .select('id')
    .is('sent_at', null)
    .lte('send_at', new Date().toISOString())
    .lt('attempts', 6)
    .order('send_at')
    .limit(limit);
  let sent = 0;
  for (const r of data ?? []) {
    try {
      await sendOutboxRow(r.id);
      sent++;
    } catch {
      /* loggat på raden */
    }
  }
  return sent;
}

export function toBase64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}
