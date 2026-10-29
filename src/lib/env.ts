// Alla miljövariabler på ett ställe. Systemsidan i adminpanelen visar vilka som saknas.

export const env = {
  // På Vercel räcker det med projektets egen adress – ingen variabel behövs.
  appUrl: (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  ).replace(/\/$/, ''),
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  superadmins: (process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  allowSignup: (process.env.ALLOW_SIGNUP || 'false').toLowerCase() === 'true',
  platformName: process.env.PLATFORM_NAME || 'Andrum',
  sessionSecret: process.env.SESSION_SECRET || '',
};

export const REQUIRED_ENV: { key: string; ok: () => boolean; help: string }[] = [
  { key: 'Appens adress', ok: () => !!env.appUrl, help: 'Sätts automatiskt på Vercel. Annars: NEXT_PUBLIC_APP_URL' },
  { key: 'SUPABASE_URL', ok: () => !!env.supabaseUrl, help: 'Supabase → Project Settings → API → Project URL' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', ok: () => !!env.supabaseServiceKey, help: 'Supabase → Project Settings → API → service_role' },
  { key: 'STRIPE_SECRET_KEY', ok: () => !!env.stripeSecretKey, help: 'Stripe → Developers → API keys → Secret key' },
  { key: 'RESEND_API_KEY', ok: () => !!env.resendApiKey, help: 'Resend → API Keys' },
  { key: 'EMAIL_FROM', ok: () => !!env.emailFrom, help: 'T.ex. bokning@dindoman.se (domänen verifierad i Resend)' },
  { key: 'SUPERADMIN_EMAILS', ok: () => env.superadmins.length > 0, help: 'Din e-post, du blir superadmin' },
];

export function isSuperadmin(email: string | null | undefined): boolean {
  return !!email && env.superadmins.includes(email.toLowerCase());
}
