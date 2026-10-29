// Inloggning för studions personal: magisk länk via e-post, inga lösenord.
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, must } from './db';
import { queueRaw } from './email';
import { env, isSuperadmin } from './env';
import { renderEmail } from './templates';
import { Studio } from './types';

const SESSION_COOKIE = 'andrum_session';
const STUDIO_COOKIE = 'andrum_studio';
const SESSION_DAYS = 30;

function secret(): string {
  const base = env.sessionSecret || env.supabaseServiceKey;
  if (!base) throw new Error('SESSION_SECRET eller SUPABASE_SERVICE_ROLE_KEY saknas.');
  return crypto.createHash('sha256').update('andrum-session:' + base).digest('hex');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export async function canLogIn(email: string): Promise<boolean> {
  if (isSuperadmin(email)) return true;
  if (env.allowSignup) return true;
  const { data } = await db().from('studio_members').select('studio_id').eq('email', email).limit(1);
  return !!data?.length;
}

/** Skickar en inloggningslänk. Svarar alltid likadant så att ingen kan gissa vilka konton som finns. */
export async function sendLoginLink(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  if (!(await canLogIn(email))) return;
  const token = crypto.randomBytes(32).toString('hex');
  must(
    await db().from('login_tokens').insert({
      token_hash: sha256(token),
      email,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    }),
  );
  const url = `${env.appUrl}/admin/verifiera?t=${token}`;
  const { html, text } = renderEmail({
    studioName: env.platformName,
    accent: '#5b7a5e',
    bodyText: 'Hej!\n\nKlicka på knappen för att logga in. Länken gäller i 30 minuter och kan bara användas en gång.',
    blocks: [
      { type: 'button', label: 'Logga in', url },
      { type: 'note', text: 'Har du inte bett om att logga in kan du strunta i det här mejlet.' },
    ],
    footer: env.platformName,
  });
  await queueRaw({ studioId: null, fromName: env.platformName, to: email, subject: `Logga in på ${env.platformName}`, html, text });
}

/** Förbrukar en inloggningslänk och sätter sessionen. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await db()
    .from('login_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', sha256(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('email')
    .maybeSingle();
  if (!data) return null;
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = Buffer.from(JSON.stringify({ e: data.email, x: exp })).toString('base64url');
  const store = await cookies();
  store.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(exp),
  });
  return data.email as string;
}

export async function currentEmail(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw || !raw.includes('.')) return null;
  const [payload, sig] = raw.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof e !== 'string' || typeof x !== 'number' || x < Date.now()) return null;
    return e;
  } catch {
    return null;
  }
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(STUDIO_COOKIE);
}

export async function requireEmail(): Promise<string> {
  const email = await currentEmail();
  if (!email) redirect('/admin/logga-in');
  return email;
}

export async function myStudios(email: string): Promise<Studio[]> {
  if (isSuperadmin(email)) {
    return (must(await db().from('studios').select('*').order('created_at')) as Studio[]) ?? [];
  }
  const members = must(await db().from('studio_members').select('studio_id').eq('email', email)) as { studio_id: string }[];
  if (!members.length) return [];
  return must(
    await db()
      .from('studios')
      .select('*')
      .in('id', members.map((m) => m.studio_id))
      .order('created_at'),
  ) as Studio[];
}

/** Inloggad + vald studio. Skickar till inloggning eller onboarding vid behov. */
export async function requireStudio(): Promise<{ email: string; studio: Studio; studios: Studio[]; superadmin: boolean }> {
  const email = await requireEmail();
  const studios = await myStudios(email);
  if (!studios.length) redirect('/admin/kom-igang');
  const store = await cookies();
  const chosen = store.get(STUDIO_COOKIE)?.value;
  const studio = studios.find((s) => s.id === chosen) ?? studios[0];
  return { email, studio, studios, superadmin: isSuperadmin(email) };
}

export async function chooseStudio(studioId: string) {
  const store = await cookies();
  store.set(STUDIO_COOKIE, studioId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

export async function requireSuperadmin(): Promise<string> {
  const email = await requireEmail();
  if (!isSuperadmin(email)) redirect('/admin');
  return email;
}
