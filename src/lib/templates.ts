// Mailmallar. Studion kan ändra ämne och text i adminpanelen; detaljer,
// knappar och kvitto läggs alltid till automatiskt så att inget kan gå sönder.

export type TemplateKey =
  | 'booking_confirmed'
  | 'course_confirmed'
  | 'reminder'
  | 'booking_cancelled'
  | 'credit_issued'
  | 'waitlist_joined'
  | 'waitlist_offer'
  | 'session_cancelled'
  | 'session_moved'
  | 'late_payment_refunded';

export type TemplateDef = { label: string; subject: string; body: string; help: string };

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  booking_confirmed: {
    label: 'Bokningsbekräftelse (pass och behandling)',
    subject: 'Bokat: {{tjanst}} {{datum}}',
    body: 'Hej {{fornamn}}!\n\nTack för din bokning hos {{studio}}. Varmt välkommen!',
    help: 'Skickas direkt när betalningen är klar.',
  },
  course_confirmed: {
    label: 'Kursbekräftelse',
    subject: 'Välkommen till {{tjanst}}',
    body:
      'Hej {{fornamn}}!\n\nDu har en plats på {{tjanst}} hos {{studio}}. ' +
      'Alla tillfällen finns nedan, och kalenderfilen lägger in dem i din kalender med ett klick.',
    help: 'Skickas när någon bokat en kurs.',
  },
  reminder: {
    label: 'Påminnelse',
    subject: 'Påminnelse: {{tjanst}} {{datum}}',
    body: 'Hej {{fornamn}}!\n\nEn påminnelse om att du är bokad hos {{studio}}. Vi ses!',
    help: 'Skickas före varje pass enligt inställningen för påminnelser.',
  },
  booking_cancelled: {
    label: 'Avbokningsbekräftelse',
    subject: 'Avbokat: {{tjanst}}',
    body: 'Hej {{fornamn}}!\n\nDin bokning av {{tjanst}} är avbokad.',
    help: 'Skickas när kunden eller du avbokar. Information om återbetalning läggs till automatiskt.',
  },
  credit_issued: {
    label: 'Tillgodokod',
    subject: 'Din tillgodokod hos {{studio}}',
    body: 'Hej {{fornamn}}!\n\nHär är din tillgodokod. Ange den när du bokar nästa gång.',
    help: 'Skickas när en kund får tillgodo i stället för återbetalning.',
  },
  waitlist_joined: {
    label: 'Väntelista – bekräftelse',
    subject: 'Du står på väntelistan: {{tjanst}}',
    body: 'Hej {{fornamn}}!\n\nDu står på väntelistan till {{tjanst}}. Vi mejlar dig direkt om en plats blir ledig.',
    help: 'Skickas när någon ställer sig på väntelistan.',
  },
  waitlist_offer: {
    label: 'Väntelista – plats ledig',
    subject: 'En plats är ledig: {{tjanst}}',
    body: 'Hej {{fornamn}}!\n\nGoda nyheter – en plats har blivit ledig på {{tjanst}}. Platsen är reserverad åt dig en kort stund.',
    help: 'Skickas när en plats blir ledig. Sista tid för att boka läggs till automatiskt.',
  },
  session_cancelled: {
    label: 'Inställt pass',
    subject: 'Inställt: {{tjanst}} {{datum}}',
    body: 'Hej {{fornamn}}!\n\nTyvärr måste vi ställa in {{tjanst}} {{datum}}. Vi ber om ursäkt för besväret.',
    help: 'Skickas när du ställer in ett pass eller en kurs.',
  },
  session_moved: {
    label: 'Flyttat pass',
    subject: 'Ny tid: {{tjanst}}',
    body: 'Hej {{fornamn}}!\n\n{{tjanst}} har fått en ny tid: {{datum}}. Hör av dig om tiden inte passar.',
    help: 'Skickas när du flyttar ett pass som har bokningar.',
  },
  late_payment_refunded: {
    label: 'Sen betalning återbetald',
    subject: 'Din betalning har återbetalats',
    body:
      'Hej {{fornamn}}!\n\nDin betalning kom fram efter att reservationen hade gått ut, och platsen hann tyvärr gå till någon annan. ' +
      'Vi har återbetalat hela beloppet.',
    help: 'Skickas i det ovanliga fallet att en betalning kommer in för sent.',
  },
};

export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: 'fornamn', label: 'Kundens förnamn' },
  { key: 'namn', label: 'Kundens hela namn' },
  { key: 'studio', label: 'Studions namn' },
  { key: 'tjanst', label: 'Pass, kurs eller behandling' },
  { key: 'datum', label: 'Datum och tid' },
];

export function renderVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => vars[k.toLowerCase()] ?? '');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type EmailBlock =
  | { type: 'details'; rows: [string, string][] }
  | { type: 'list'; title?: string; items: string[] }
  | { type: 'button'; label: string; url: string }
  | { type: 'note'; text: string }
  | { type: 'code'; label: string; code: string };

export function renderEmail(opts: {
  studioName: string;
  accent: string;
  bodyText: string;
  blocks: EmailBlock[];
  footer: string;
}): { html: string; text: string } {
  const accent = /^#[0-9a-f]{3,8}$/i.test(opts.accent) ? opts.accent : '#5b7a5e';
  const paragraphs = opts.bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const textParts: string[] = [opts.bodyText, ''];
  const blockHtml = opts.blocks
    .map((b) => {
      if (b.type === 'details') {
        textParts.push(...b.rows.map(([k, v]) => `${k}: ${v}`), '');
        return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 18px;background:#f6f4f0;border-radius:10px">${b.rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:9px 14px;color:#6b6f6a;font-size:14px;width:38%;vertical-align:top">${escapeHtml(
                k,
              )}</td><td style="padding:9px 14px;font-size:14px;vertical-align:top">${escapeHtml(v).replace(
                /\n/g,
                '<br>',
              )}</td></tr>`,
          )
          .join('')}</table>`;
      }
      if (b.type === 'list') {
        if (b.title) textParts.push(b.title);
        textParts.push(...b.items.map((i) => `• ${i}`), '');
        return `${b.title ? `<p style="margin:8px 0 6px;font-weight:600">${escapeHtml(b.title)}</p>` : ''}<ul style="margin:0 0 18px;padding-left:20px;line-height:1.7">${b.items
          .map((i) => `<li>${escapeHtml(i)}</li>`)
          .join('')}</ul>`;
      }
      if (b.type === 'button') {
        textParts.push(`${b.label}: ${b.url}`, '');
        return `<p style="margin:6px 0 18px"><a href="${escapeHtml(
          b.url,
        )}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600;font-size:15px">${escapeHtml(
          b.label,
        )}</a></p>`;
      }
      if (b.type === 'code') {
        textParts.push(`${b.label}: ${b.code}`, '');
        return `<p style="margin:6px 0 4px;color:#6b6f6a;font-size:14px">${escapeHtml(
          b.label,
        )}</p><p style="margin:0 0 18px;font-size:24px;font-weight:700;letter-spacing:3px">${escapeHtml(b.code)}</p>`;
      }
      textParts.push(b.text, '');
      return `<p style="margin:0 0 14px;color:#6b6f6a;font-size:14px;line-height:1.5">${escapeHtml(b.text).replace(
        /\n/g,
        '<br>',
      )}</p>`;
    })
    .join('');

  textParts.push('—', opts.footer);

  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f3f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2421">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 18px;color:${accent}">${escapeHtml(
    opts.studioName,
  )}</div>
<div style="background:#fff;border-radius:16px;padding:26px 24px;font-size:16px">${paragraphs}${blockHtml}</div>
<p style="color:#8a8d88;font-size:12px;line-height:1.5;margin:16px 4px">${escapeHtml(opts.footer).replace(
    /\n/g,
    '<br>',
  )}</p>
</div></body></html>`;

  return { html, text: textParts.join('\n') };
}
