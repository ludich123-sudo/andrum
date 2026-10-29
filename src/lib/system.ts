// Självinstallation och hälsokontroll. Allt som går att automatisera görs härifrån.
import crypto from 'crypto';
import { db, getConfig, setConfig } from './db';
import { env, REQUIRED_ENV } from './env';
import { ensureWebhook, webhookSecret } from './stripe';

export type Check = { label: string; ok: boolean; detail: string; fix?: string };

export async function ensureCron(): Promise<{ ok: boolean; message: string }> {
  if (!env.appUrl) return { ok: false, message: 'NEXT_PUBLIC_APP_URL saknas' };
  const url = `${env.appUrl}/api/cron`;
  if ((await getConfig('cron_url')) !== url) await setConfig('cron_url', url);
  if (!(await getConfig('cron_secret'))) await setConfig('cron_secret', crypto.randomBytes(24).toString('hex'));
  return { ok: true, message: 'Automatiken är inställd' };
}

export async function runSetup(): Promise<string[]> {
  const out: string[] = [];
  const cron = await ensureCron();
  out.push(`Automatik: ${cron.message}`);
  const hook = await ensureWebhook();
  out.push(`Stripe: ${hook.message}`);
  return out;
}

export async function healthChecks(): Promise<Check[]> {
  const checks: Check[] = REQUIRED_ENV.map((e) => ({
    label: e.key,
    ok: e.ok(),
    detail: e.ok() ? 'Satt' : 'Saknas',
    fix: e.ok() ? undefined : e.help,
  }));

  let dbOk = false;
  try {
    const v = await getConfig('schema_version');
    dbOk = !!v;
    checks.push({
      label: 'Databas',
      ok: dbOk,
      detail: dbOk ? `Schema version ${v}` : 'Schemat är inte installerat',
      fix: dbOk ? undefined : 'Kör supabase/schema.sql i Supabase → SQL Editor',
    });
  } catch (e: any) {
    checks.push({ label: 'Databas', ok: false, detail: e?.message ?? 'Ingen kontakt', fix: 'Kontrollera Supabase-nycklarna' });
  }
  if (!dbOk) return checks;

  const cronUrl = await getConfig('cron_url');
  const lastTick = await getConfig('cron_last_run');
  const tickAge = lastTick ? (Date.now() - new Date(lastTick).getTime()) / 60000 : null;
  checks.push({
    label: 'Automatik (var 5:e minut)',
    ok: !!cronUrl && tickAge !== null && tickAge < 20,
    detail: !cronUrl
      ? 'Inte inställd'
      : tickAge === null
        ? 'Inställd, väntar på första körningen'
        : `Senast för ${Math.round(tickAge)} min sedan`,
    fix: !cronUrl ? 'Tryck på "Kör installation"' : tickAge === null || tickAge >= 20 ? 'Kontrollera att pg_cron och pg_net är på i Supabase (Database → Extensions)' : undefined,
  });

  const hookOk = !!env.stripeWebhookSecret || !!(await webhookSecret());
  checks.push({
    label: 'Stripe-webhook',
    ok: hookOk,
    detail: hookOk ? 'Klar' : 'Inte skapad',
    fix: hookOk ? undefined : 'Tryck på "Kör installation"',
  });

  const { count: failed } = await db()
    .from('outbox')
    .select('id', { count: 'exact', head: true })
    .is('sent_at', null)
    .gte('attempts', 3);
  checks.push({
    label: 'Mail',
    ok: !failed,
    detail: failed ? `${failed} mail har inte gått att skicka` : 'Inga fel',
    fix: failed ? 'Kontrollera RESEND_API_KEY, EMAIL_FROM och att domänen är verifierad i Resend' : undefined,
  });

  return checks;
}
