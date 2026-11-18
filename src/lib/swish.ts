// Swish Handel: betalningar direkt till studions bankkonto, utan mellanhand.
//
// Kommunikationen med Swish sker med ömsesidig TLS: studions certifikat (från Swish
// certifikatportal) identifierar studion. Den privata nyckeln skapas här, lämnar aldrig
// servern och sparas krypterad i databasen.
import crypto from 'crypto';
import https from 'https';
import tls from 'tls';
import { env } from './env';

export const SWISH_API = 'https://cpc.getswish.net/swish-cpcapi';
export const SWISH_QR_API = 'https://mpc.getswish.net/qrg-swish/api/v1/commerce';
export const SWISH_PORTAL = 'https://portal.swish.nu';

export type SwishCreds = {
  number: string;
  keyPem: string;
  certPem: string;
  caPem?: string | null;
};

// ---------------------------------------------------------------------
// Kryptering av den privata nyckeln i databasen
// ---------------------------------------------------------------------

function encKey(): Buffer {
  const base = env.sessionSecret || env.supabaseServiceKey;
  if (!base) throw new Error('SESSION_SECRET eller SUPABASE_SERVICE_ROLE_KEY saknas.');
  return crypto.createHash('sha256').update('andrum-swish-key:' + base).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Okänt format på sparad nyckel.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------
// Certifikatbegäran (CSR, PKCS#10) – byggs med Nodes inbyggda kryptografi
// ---------------------------------------------------------------------

function derLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag: number, content: Buffer) => Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]) => tlv(0x31, Buffer.concat(parts));
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, 'utf8'));
const printable = (s: string) => tlv(0x13, Buffer.from(s, 'ascii'));
function oid(dotted: string): Buffer {
  const parts = dotted.split('.').map(Number);
  const bytes: number[] = [parts[0] * 40 + parts[1]];
  for (const p of parts.slice(2)) {
    const stack: number[] = [p & 0x7f];
    let v = p >> 7;
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v >>= 7;
    }
    bytes.push(...stack);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function pem(label: string, der: Buffer): string {
  const b64 = der.toString('base64').match(/.{1,64}/g)!.join('\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

/** Skapar ett nytt nyckelpar (RSA 4096) och en certifikatbegäran att klistra in i Swish portal. */
export function generateSwishCsr(swishNumber: string, organisation: string): { keyPem: string; csrPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 4096 });
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const org = organisation.replace(/[^\p{L}\p{N} .,&-]/gu, '').slice(0, 60) || 'Studio';
  const subject = seq(
    set(seq(oid('2.5.4.6'), printable('SE'))),
    set(seq(oid('2.5.4.10'), utf8(org))),
    set(seq(oid('2.5.4.3'), utf8(swishNumber || org))),
  );
  const info = seq(tlv(0x02, Buffer.from([0])), subject, spki, Buffer.from([0xa0, 0x00]));
  const signature = crypto.sign('sha256', info, privateKey);
  const algorithm = seq(oid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00]));
  const csr = seq(info, algorithm, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])));
  return {
    keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    csrPem: pem('CERTIFICATE REQUEST', csr),
  };
}

/** Plockar ut alla certifikat ur en PEM-fil (Swish levererar certifikatet och dess kedja i samma fil). */
export function splitPemCerts(text: string): string[] {
  return (text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map((c) => c.trim() + '\n');
}

/** Kontrollerar att certifikatet från Swish hör ihop med vår nyckel. Returnerar sista giltighetsdag. */
export function validateSwishCertificate(certText: string, keyPem: string): { validTo: Date; subject: string } {
  const certs = splitPemCerts(certText);
  if (!certs.length) {
    throw new Error('Hittar inget certifikat i texten. Den ska börja med -----BEGIN CERTIFICATE-----.');
  }
  const key = crypto.createPrivateKey(keyPem);
  const match = certs.map((c) => new crypto.X509Certificate(c)).find((x) => x.checkPrivateKey(key));
  if (!match) {
    throw new Error(
      'Certifikatet hör inte ihop med den senaste certifikatbegäran. Skapa certifikatet i Swish portal från den senaste koden på den här sidan.',
    );
  }
  const validTo = new Date(match.validTo);
  if (validTo.getTime() < Date.now()) throw new Error('Certifikatet har gått ut. Skapa ett nytt i Swish portal.');
  return { validTo, subject: match.subject };
}

// ---------------------------------------------------------------------
// Små hjälpfunktioner
// ---------------------------------------------------------------------

/** Swishnummer för företag: 10 siffror som börjar med 123. */
export function normalizeSwishNumber(input: string): string | null {
  const d = (input || '').replace(/\D/g, '');
  return /^123\d{7}$/.test(d) ? d : null;
}

/** Mobilnummer till Swish-format 46XXXXXXXXX. */
export function normalizePhone(input: string): string | null {
  let d = (input || '').replace(/\D/g, '');
  if (d.startsWith('0046')) d = d.slice(2);
  else if (d.startsWith('0')) d = '46' + d.slice(1);
  return /^467\d{7,8}$/.test(d) ? d : null;
}

/** Swish tillåter bara vissa tecken i meddelandet, max 50. */
export function swishMessage(text: string): string {
  return text
    .replace(/[–—]/g, '-')
    .replace(/[^A-Za-z0-9ÅÄÖåäöÉéÜü :;.,?!()\-"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

export function swishAmount(ore: number): string {
  return (Math.round(ore) / 100).toFixed(2);
}

export function newInstructionId(): string {
  return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

const ERROR_TEXT: Record<string, string> = {
  TM01: 'Betalningen hann inte godkännas i tid.',
  RF07: 'Betalningen avbröts i Swish-appen.',
  BANKIDCL: 'Betalningen avbröts i BankID.',
  BANKIDONGOING: 'BankID används redan. Försök igen om en stund.',
  BANKIDUNKN: 'BankID kunde inte genomföra signeringen.',
  BE18: 'Mobilnumret är inte kopplat till Swish.',
  ACMT03: 'Mobilnumret är inte kopplat till Swish.',
  ACMT01: 'Swish är inte aktiverat för det här numret.',
  AM02: 'Beloppet är för stort för din Swish.',
  AM06: 'Beloppet är för lågt.',
  AM21: 'Beloppet överstiger din gräns i Swish.',
  RP06: 'Det finns redan en pågående betalning till ditt nummer. Avsluta den först.',
  VR01: 'Du uppfyller inte åldersgränsen för köpet.',
};

export function swishErrorText(code?: string | null, fallback?: string | null): string {
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code];
  return fallback || 'Betalningen gick inte igenom. Försök igen.';
}

// ---------------------------------------------------------------------
// Anrop till Swish
// ---------------------------------------------------------------------

type SwishResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

function swishRequest(
  creds: SwishCreds,
  method: 'GET' | 'PUT' | 'PATCH' | 'POST',
  path: string,
  body?: unknown,
  contentType = 'application/json',
): Promise<SwishResponse> {
  // SWISH_API_BASE kan pekas om, t.ex. till Swish testmiljö (MSS).
  const url = new URL((process.env.SWISH_API_BASE || SWISH_API) + path);
  // Litar på vanliga rot-certifikat plus Swish egna (som följer med certifikatfilen).
  const ca = [...tls.rootCertificates, ...splitPemCerts(creds.certPem), ...splitPemCerts(creds.caPem ?? '')];
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: url.port ? Number(url.port) : 443,
        key: creds.keyPem,
        cert: creds.certPem,
        ca,
        minVersion: 'TLSv1.2',
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': contentType, 'Content-Length': payload.length } : {}),
        },
        timeout: 20000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('Swish svarade inte i tid.')));
    req.on('error', (e: any) => {
      const tlsCodes = ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'DEPTH_ZERO_SELF_SIGNED_CERT'];
      if (tlsCodes.includes(e?.code)) {
        reject(new Error(`Swish servercertifikat kunde inte verifieras (${e.code}). Lägg in Swish rot-certifikat under "Avancerat".`));
      } else if (/handshake|alert|certificate|socket hang up|ECONNRESET/i.test(`${e?.message ?? ''} ${e?.code ?? ''}`)) {
        reject(new Error(`Swish godkände inte certifikatet (${e.message}). Kontrollera att certifikatet är aktivt i Swish portal.`));
      } else {
        reject(e);
      }
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function header(res: SwishResponse, name: string): string | null {
  const v = res.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

function parseErrors(res: SwishResponse): string {
  try {
    const data = JSON.parse(res.body);
    const list = Array.isArray(data) ? data : [data];
    return list.map((e: any) => `${e.errorCode ?? ''} ${e.errorMessage ?? ''}`.trim()).join('; ') || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}${res.body ? `: ${res.body.slice(0, 200)}` : ''}`;
  }
}

export type SwishPaymentStatus = {
  id: string;
  status: 'CREATED' | 'PAID' | 'DECLINED' | 'ERROR' | 'CANCELLED';
  paymentReference?: string | null;
  amount?: number | string | null;
  datePaid?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

/**
 * Skapar en betalningsförfrågan. Utan mobilnummer får vi en token som öppnar
 * Swish-appen på samma telefon (eller visas som QR-kod). Med mobilnummer skickas
 * förfrågan direkt till kundens app.
 */
export async function createSwishPayment(
  creds: SwishCreds,
  opts: { reference: string; amountOre: number; message: string; callbackUrl: string; payerPhone?: string | null },
): Promise<{ id: string; token: string | null }> {
  const id = newInstructionId();
  const body: Record<string, unknown> = {
    payeePaymentReference: opts.reference.replace(/[^A-Za-z0-9]/g, '').slice(0, 35),
    callbackUrl: opts.callbackUrl,
    payeeAlias: creds.number,
    amount: swishAmount(opts.amountOre),
    currency: 'SEK',
    message: swishMessage(opts.message),
  };
  if (opts.payerPhone) body.payerAlias = opts.payerPhone;
  const res = await swishRequest(creds, 'PUT', `/api/v2/paymentrequests/${id}`, body);
  if (res.status !== 201 && res.status !== 200) throw new Error(`Swish: ${parseErrors(res)}`);
  return { id, token: header(res, 'paymentrequesttoken') };
}

export async function getSwishPayment(creds: SwishCreds, id: string): Promise<SwishPaymentStatus> {
  const res = await swishRequest(creds, 'GET', `/api/v1/paymentrequests/${encodeURIComponent(id)}`);
  if (res.status !== 200) throw new Error(`Swish: ${parseErrors(res)}`);
  return JSON.parse(res.body);
}

export async function cancelSwishPayment(creds: SwishCreds, id: string): Promise<void> {
  try {
    await swishRequest(
      creds,
      'PATCH',
      `/api/v1/paymentrequests/${encodeURIComponent(id)}`,
      [{ op: 'replace', path: '/status', value: 'cancelled' }],
      'application/json-patch+json',
    );
  } catch {
    /* redan betald, avbruten eller utgången */
  }
}

export async function createSwishRefund(
  creds: SwishCreds,
  opts: { originalPaymentReference: string; amountOre: number; message: string; callbackUrl: string },
): Promise<string> {
  const id = newInstructionId();
  const res = await swishRequest(creds, 'PUT', `/api/v2/refunds/${id}`, {
    originalPaymentReference: opts.originalPaymentReference,
    callbackUrl: opts.callbackUrl,
    payerAlias: creds.number,
    amount: swishAmount(opts.amountOre),
    currency: 'SEK',
    message: swishMessage(opts.message),
  });
  if (res.status !== 201 && res.status !== 200) throw new Error(`Swish återbetalning: ${parseErrors(res)}`);
  return id;
}

/** Testar att certifikatet fungerar: ett anrop som Swish ska svara "finns inte" på. */
export async function testSwishConnection(creds: SwishCreds): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await swishRequest(creds, 'GET', `/api/v1/paymentrequests/${newInstructionId()}`);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Swish nekade certifikatet. Kontrollera att det är aktivt och hör till rätt Swishnummer.' };
    }
    return { ok: true, message: 'Anslutningen till Swish fungerar.' };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? String(e) };
  }
}

/** QR-kod (SVG) att skanna med Swish-appen när kunden sitter vid en dator. */
export async function swishQrSvg(token: string): Promise<string | null> {
  try {
    const res = await fetch(SWISH_QR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, size: 300, format: 'svg', border: 0 }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const svg = await res.text();
    return svg.includes('<svg') ? svg : null;
  } catch {
    return null;
  }
}

export function swishAppUrl(token: string, returnUrl: string): string {
  return `swish://paymentrequest?token=${encodeURIComponent(token)}&callbackurl=${encodeURIComponent(returnUrl)}`;
}
