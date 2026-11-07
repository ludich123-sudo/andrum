// Mailmallar. Studion kan ändra ämne och text i adminpanelen; rubrik, detaljer,
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

export type TemplateDef = {
  label: string;
  subject: string;
  body: string;
  help: string;
  /** Liten versal etikett överst i mejlet. */
  eyebrow: string;
  /** Stor rubrik i mejlets topp. */
  heading: string;
  /** Texten som syns i inkorgen innan mejlet öppnas. */
  preheader: string;
};

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  booking_confirmed: {
    label: 'Bokningsbekräftelse (pass och behandling)',
    subject: 'Bokat: {{tjanst}} {{datum}}',
    eyebrow: 'Bokningsbekräftelse',
    heading: 'Välkommen, {{fornamn}}.',
    preheader: '{{tjanst}}, {{datum}}. Här är din bekräftelse och kalenderfil.',
    body: 'Din plats är bokad och betald. Allt du behöver veta står här nedan – vi ser fram emot att träffa dig.',
    help: 'Skickas direkt när betalningen är klar.',
  },
  course_confirmed: {
    label: 'Kursbekräftelse',
    subject: 'Välkommen till {{tjanst}}',
    eyebrow: 'Kursbekräftelse',
    heading: 'Välkommen till kursen, {{fornamn}}.',
    preheader: 'Din plats på {{tjanst}} är klar. Alla datum och kalenderfil finns i mejlet.',
    body:
      'Du har en plats på {{tjanst}}. Alla tillfällen står nedan, och kalenderfilen lägger in dem i din kalender med ett klick. ' +
      'Du får en påminnelse före varje tillfälle.',
    help: 'Skickas när någon bokat en kurs.',
  },
  reminder: {
    label: 'Påminnelse',
    subject: 'Påminnelse: {{tjanst}} {{datum}}',
    eyebrow: 'Påminnelse',
    heading: 'Vi ses snart, {{fornamn}}.',
    preheader: '{{tjanst}}, {{datum}}. Varmt välkommen!',
    body: 'En vänlig påminnelse om att du är bokad. Kom gärna några minuter innan start.',
    help: 'Skickas före varje pass enligt inställningen för påminnelser.',
  },
  booking_cancelled: {
    label: 'Avbokningsbekräftelse',
    subject: 'Avbokat: {{tjanst}}',
    eyebrow: 'Avbokning',
    heading: 'Din bokning är avbokad.',
    preheader: 'Bekräftelse på avbokning av {{tjanst}}.',
    body: 'Hej {{fornamn}}, din bokning av {{tjanst}} är nu avbokad. Hoppas vi ses en annan gång.',
    help: 'Skickas när kunden eller du avbokar. Information om återbetalning läggs till automatiskt.',
  },
  credit_issued: {
    label: 'Tillgodokod',
    subject: 'Din tillgodokod hos {{studio}}',
    eyebrow: 'Tillgodo',
    heading: 'Här är din tillgodokod.',
    preheader: 'Använd koden när du bokar nästa gång.',
    body: 'Hej {{fornamn}}, ange koden nedan när du bokar nästa gång så dras beloppet av automatiskt.',
    help: 'Skickas när en kund får tillgodo i stället för återbetalning.',
  },
  waitlist_joined: {
    label: 'Väntelista – bekräftelse',
    subject: 'Du står på väntelistan: {{tjanst}}',
    eyebrow: 'Väntelista',
    heading: 'Du står på väntelistan.',
    preheader: 'Vi mejlar dig direkt om en plats blir ledig på {{tjanst}}.',
    body: 'Hej {{fornamn}}, vi mejlar dig direkt om en plats blir ledig på {{tjanst}}.',
    help: 'Skickas när någon ställer sig på väntelistan.',
  },
  waitlist_offer: {
    label: 'Väntelista – plats ledig',
    subject: 'En plats är ledig: {{tjanst}}',
    eyebrow: 'Ledig plats',
    heading: 'En plats har blivit ledig.',
    preheader: 'Platsen på {{tjanst}} är reserverad åt dig en kort stund.',
    body: 'Hej {{fornamn}}, goda nyheter – en plats på {{tjanst}} är reserverad åt dig en kort stund.',
    help: 'Skickas när en plats blir ledig. Sista tid för att boka läggs till automatiskt.',
  },
  session_cancelled: {
    label: 'Inställt pass',
    subject: 'Inställt: {{tjanst}} {{datum}}',
    eyebrow: 'Inställt',
    heading: 'Tyvärr måste vi ställa in.',
    preheader: '{{tjanst}}, {{datum}} är inställt. Läs mer om vad som händer nu.',
    body: 'Hej {{fornamn}}, vi måste tyvärr ställa in {{tjanst}} {{datum}}. Vi ber om ursäkt för besväret.',
    help: 'Skickas när du ställer in ett pass eller en kurs.',
  },
  session_moved: {
    label: 'Flyttat pass',
    subject: 'Ny tid: {{tjanst}}',
    eyebrow: 'Ny tid',
    heading: 'Ny tid för {{tjanst}}.',
    preheader: 'Ny tid: {{datum}}.',
    body: 'Hej {{fornamn}}, {{tjanst}} har flyttats till {{datum}}. Hör av dig om tiden inte passar.',
    help: 'Skickas när du flyttar ett pass som har bokningar.',
  },
  late_payment_refunded: {
    label: 'Sen betalning återbetald',
    subject: 'Din betalning har återbetalats',
    eyebrow: 'Återbetalning',
    heading: 'Din betalning är återbetald.',
    preheader: 'Platsen hann gå till någon annan – hela beloppet är återbetalt.',
    body:
      'Hej {{fornamn}}, din betalning kom fram efter att reservationen hade gått ut, och platsen hann tyvärr gå till någon annan. ' +
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

// Färger från designen: djup skogsgrön, limegrön accent, krämvit bakgrund.
const C = {
  page: '#f4f2ec',
  card: '#ffffff',
  dark: '#12301f',
  ink: '#12301f',
  ink2: '#4c5a52',
  ink3: '#8a938c',
  line: '#e6e3da',
  lime: '#c6f27a',
  eyebrowLight: '#1f7a4c',
};

const SANS = "'Inter Tight','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "'Newsreader',Georgia,'Times New Roman',serif";

export function renderEmail(opts: {
  studioName: string;
  accent: string;
  bodyText: string;
  blocks: EmailBlock[];
  footer: string;
  eyebrow?: string;
  heading?: string;
  preheader?: string;
}): { html: string; text: string } {
  const accent = /^#[0-9a-f]{6}$/i.test(opts.accent) ? opts.accent : '#1d4d38';
  const paragraphs = opts.bodyText
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${C.ink2}">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');

  const textParts: string[] = [];
  if (opts.heading) textParts.push(opts.heading, '');
  textParts.push(opts.bodyText, '');

  const blockHtml = opts.blocks
    .map((b) => {
      if (b.type === 'details') {
        textParts.push(...b.rows.map(([k, v]) => `${k}: ${v}`), '');
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 24px;border-top:1px solid ${C.ink}">${b.rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:14px 12px 14px 0;border-bottom:1px solid ${C.line};vertical-align:top;width:34%;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.ink3}">${escapeHtml(
                k,
              )}</td><td style="padding:12px 0;border-bottom:1px solid ${C.line};vertical-align:top;font-size:15px;line-height:1.55;color:${C.ink}">${escapeHtml(
                v,
              ).replace(/\n/g, '<br>')}</td></tr>`,
          )
          .join('')}</table>`;
      }
      if (b.type === 'list') {
        if (b.title) textParts.push(b.title);
        textParts.push(...b.items.map((i) => `• ${i}`), '');
        return `${b.title ? `<p style="margin:8px 0 6px;font-weight:700;color:${C.ink}">${escapeHtml(b.title)}</p>` : ''}<ul style="margin:0 0 20px;padding-left:20px;line-height:1.7;color:${C.ink}">${b.items
          .map((i) => `<li>${escapeHtml(i)}</li>`)
          .join('')}</ul>`;
      }
      if (b.type === 'button') {
        textParts.push(`${b.label}: ${b.url}`, '');
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px"><tr><td style="border-radius:999px;background:${accent}"><a href="${escapeHtml(
          b.url,
        )}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:0.01em;color:#f4f2ec;text-decoration:none;border-radius:999px">${escapeHtml(
          b.label,
        )} &rarr;</a></td></tr></table>`;
      }
      if (b.type === 'code') {
        textParts.push(`${b.label}: ${b.code}`, '');
        return `<div style="margin:4px 0 24px;padding:20px 22px;border-radius:16px;background:${C.dark}"><div style="font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${C.lime};margin-bottom:8px">${escapeHtml(
          b.label,
        )}</div><div style="font-family:${SANS};font-size:28px;font-weight:800;letter-spacing:0.12em;color:#ffffff">${escapeHtml(b.code)}</div></div>`;
      }
      textParts.push(b.text, '');
      return `<p style="margin:0 0 16px;color:${C.ink3};font-size:13px;line-height:1.6">${escapeHtml(b.text).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  textParts.push('—', opts.footer);

  // Preheader: syns i inkorgen. Utfyllnaden hindrar att resten av mejlet läcker in i förhandsvisningen.
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};opacity:0">${escapeHtml(
        opts.preheader,
      )}${'&#847;&zwnj;&nbsp;'.repeat(90)}</div>`
    : '';

  const header = `<tr><td style="background:${C.dark};background-image:linear-gradient(160deg,#0f2a20 0%,#1d5a3f 100%);padding:28px 32px 34px;border-radius:20px 20px 0 0">
<div style="font-family:${SANS};font-size:15px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;margin-bottom:34px">${escapeHtml(
    opts.studioName,
  )}<span style="color:${C.lime}">.</span></div>
${opts.eyebrow ? `<div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${C.lime};margin-bottom:12px">${escapeHtml(opts.eyebrow)}</div>` : ''}
${opts.heading ? `<div style="font-family:${SANS};font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.025em;color:#ffffff">${escapeHtml(opts.heading)}</div>` : ''}
</td></tr>`;

  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(
    opts.heading ?? opts.studioName,
  )}</title></head>
<body style="margin:0;padding:0;background:${C.page};font-family:${SANS};color:${C.ink};-webkit-font-smoothing:antialiased">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
${header}
<tr><td style="background:${C.card};padding:30px 32px 10px;border-radius:0 0 20px 20px;border:1px solid ${C.line};border-top:0">${paragraphs}${blockHtml}</td></tr>
<tr><td style="padding:22px 8px 0;font-size:12px;line-height:1.6;color:${C.ink3}">${escapeHtml(opts.footer).replace(/\n/g, '<br>')}</td></tr>
<tr><td style="padding:10px 8px 0;font-family:${SERIF};font-style:italic;font-size:13px;color:${C.eyebrowLight}">Varmt välkommen.</td></tr>
</table></td></tr></table></body></html>`;

  return { html, text: textParts.join('\n') };
}
