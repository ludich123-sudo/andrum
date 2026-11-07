import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Diagnos utan hemligheter: visar bara om saker är inställda och fungerar.
// /api/health?email=din@epost.se kontrollerar även om adressen får logga in.
export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get('email') || '').trim().toLowerCase();
  const out: Record<string, unknown> = {
    appAdress: env.appUrl || 'SAKNAS',
    SUPABASE_URL: env.supabaseUrl ? (env.supabaseUrl.startsWith('https://') ? 'ok' : 'FEL FORMAT – ska börja med https://') : 'SAKNAS',
    SUPABASE_SERVICE_ROLE_KEY: env.supabaseServiceKey
      ? env.supabaseServiceKey.startsWith('eyJ') || env.supabaseServiceKey.startsWith('sb_secret_')
        ? 'ok'
        : 'FEL FORMAT – ska börja med eyJ'
      : 'SAKNAS',
    STRIPE_SECRET_KEY: env.stripeSecretKey ? (env.stripeSecretKey.startsWith('sk_') ? 'ok' : 'FEL FORMAT – ska börja med sk_') : 'SAKNAS',
    RESEND_API_KEY: env.resendApiKey ? (env.resendApiKey.startsWith('re_') ? 'ok' : 'FEL FORMAT – ska börja med re_') : 'SAKNAS',
    EMAIL_FROM: env.emailFrom || 'SAKNAS',
    antalSuperadmins: env.superadmins.length,
  };
  if (email) out.dennaEpostArSuperadmin = env.superadmins.includes(email);

  try {
    const { data, error } = await db().from('app_config').select('value').eq('key', 'schema_version').maybeSingle();
    out.databas = error ? `FEL: ${error.message}` : data ? `ok (schema ${data.value})` : 'ansluten, men schema.sql är inte körd';
  } catch (e: any) {
    out.databas = `FEL: ${e?.message ?? e}`;
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
