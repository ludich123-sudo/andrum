import Stripe from 'stripe';
import { db, getConfig, setConfig } from './db';
import { env } from './env';
import { Studio } from './types';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    if (!env.stripeSecretKey) throw new Error('STRIPE_SECRET_KEY saknas.');
    client = new Stripe(env.stripeSecretKey);
  }
  return client;
}

export const isTestMode = () => env.stripeSecretKey.startsWith('sk_test') || env.stripeSecretKey.startsWith('rk_test');

export const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'account.updated',
  'charge.refunded',
] as const;

// Test- och skarpt läge har var sin webhook, så att bytet mellan dem bara kräver en ny nyckel.
const mode = () => (isTestMode() ? 'test' : 'live');
const cfgKey = (k: string) => `stripe_${mode()}_${k}`;

export async function webhookSecret(): Promise<string | null> {
  if (env.stripeWebhookSecret) return env.stripeWebhookSecret;
  return getConfig(cfgKey('webhook_secret'));
}

/** Skapar Stripe-webhooken automatiskt (en gång). */
export async function ensureWebhook(): Promise<{ ok: boolean; message: string }> {
  if (!env.stripeSecretKey) return { ok: false, message: 'STRIPE_SECRET_KEY saknas' };
  if (!env.appUrl) return { ok: false, message: 'NEXT_PUBLIC_APP_URL saknas' };
  if (env.stripeWebhookSecret) return { ok: true, message: 'Webhook-nyckel finns i miljövariabler' };
  const url = `${env.appUrl}/api/stripe/webhook`;
  const existingId = await getConfig(cfgKey('webhook_id'));
  const existingUrl = await getConfig(cfgKey('webhook_url'));
  const existingSecret = await getConfig(cfgKey('webhook_secret'));
  if (existingId && existingSecret && existingUrl === url) {
    return { ok: true, message: 'Webhook redan skapad' };
  }
  try {
    if (existingId) {
      try {
        await stripe().webhookEndpoints.del(existingId);
      } catch {
        /* redan borttagen */
      }
    }
    const endpoint = await stripe().webhookEndpoints.create({
      url,
      enabled_events: [...WEBHOOK_EVENTS] as any,
      connect: true,
      description: `${env.platformName} – bokningar`,
    });
    await setConfig(cfgKey('webhook_id'), endpoint.id);
    await setConfig(cfgKey('webhook_url'), url);
    await setConfig(cfgKey('webhook_secret'), endpoint.secret as string);
    return { ok: true, message: 'Webhook skapad' };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? String(e) };
  }
}

/** Startar Stripe-kopplingen för en studio och returnerar länken till Stripes formulär. */
export async function connectOnboardingLink(studio: Studio, returnPath: string): Promise<string> {
  let accountId = studio.stripe_account_id;
  if (accountId && !(await accountExists(accountId))) accountId = null; // t.ex. efter byte från test till skarpt
  if (!accountId) {
    const account = await stripe().accounts.create({
      type: 'standard',
      country: 'SE',
      email: studio.email ?? undefined,
      business_profile: { name: studio.name, url: studio.website ?? undefined },
      metadata: { studio_id: studio.id },
    } as any);
    accountId = account.id;
    await db().from('studios').update({ stripe_account_id: accountId }).eq('id', studio.id);
  }
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${env.appUrl}${returnPath}?stripe=refresh`,
    return_url: `${env.appUrl}${returnPath}?stripe=klar`,
  });
  return link.url;
}

async function accountExists(id: string): Promise<boolean> {
  try {
    await stripe().accounts.retrieve(id);
    return true;
  } catch (e: any) {
    if (e?.code === 'resource_missing' || e?.statusCode === 404 || e?.raw?.code === 'account_invalid') return false;
    throw e;
  }
}

export async function refreshStripeStatus(studio: Studio): Promise<boolean> {
  if (!studio.stripe_account_id) return false;
  if (!(await accountExists(studio.stripe_account_id))) {
    await db().from('studios').update({ stripe_account_id: null, stripe_charges_enabled: false }).eq('id', studio.id);
    return false;
  }
  const acct = await stripe().accounts.retrieve(studio.stripe_account_id);
  const enabled = !!acct.charges_enabled;
  if (enabled !== studio.stripe_charges_enabled) {
    await db().from('studios').update({ stripe_charges_enabled: enabled }).eq('id', studio.id);
  }
  return enabled;
}

export async function createCheckout(opts: {
  studio: Studio;
  bookingId: string;
  amountOre: number;
  title: string;
  description?: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const feeOre = Math.floor((opts.amountOre * Number(opts.studio.platform_fee_percent || 0)) / 100);
  const params: any = {
    mode: 'payment',
    locale: 'sv',
    customer_email: opts.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'sek',
          unit_amount: opts.amountOre,
          product_data: { name: opts.title, ...(opts.description ? { description: opts.description } : {}) },
        },
      },
    ],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    // Stripe kräver minst 30 minuter. Platsen hålls lika länge.
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    metadata: { booking_id: opts.bookingId, studio_id: opts.studio.id },
    payment_intent_data: {
      metadata: { booking_id: opts.bookingId, studio_id: opts.studio.id },
      description: `${opts.studio.name}: ${opts.title}`,
      ...(feeOre > 0 ? { application_fee_amount: feeOre } : {}),
    },
  };
  const session = await stripe().checkout.sessions.create(params, {
    stripeAccount: opts.studio.stripe_account_id!,
  });
  return { id: session.id, url: session.url! };
}

export async function retrieveCheckout(studio: Studio, checkoutId: string) {
  return stripe().checkout.sessions.retrieve(checkoutId, {}, { stripeAccount: studio.stripe_account_id! });
}

export async function expireCheckout(studio: Studio, checkoutId: string) {
  try {
    await stripe().checkout.sessions.expire(checkoutId, {}, { stripeAccount: studio.stripe_account_id! });
  } catch {
    /* redan betald eller utgången */
  }
}

/** "Swish" eller "kort" för kvittot. */
export async function paymentMethodLabel(studio: Studio, paymentIntentId: string | null): Promise<string> {
  if (!paymentIntentId) return 'Stripe';
  try {
    const pi: any = await stripe().paymentIntents.retrieve(
      paymentIntentId,
      { expand: ['latest_charge'] },
      { stripeAccount: studio.stripe_account_id! },
    );
    const type = pi?.latest_charge?.payment_method_details?.type;
    if (type === 'swish') return 'Swish';
    if (type === 'card') return 'kort';
    if (type === 'klarna') return 'Klarna';
    return type || 'Stripe';
  } catch {
    return 'Stripe';
  }
}

export async function refundPayment(studio: Studio, paymentIntent: string, amountOre: number) {
  return stripe().refunds.create(
    {
      payment_intent: paymentIntent,
      amount: amountOre,
      ...(Number(studio.platform_fee_percent) > 0 ? { refund_application_fee: true } : {}),
    } as any,
    { stripeAccount: studio.stripe_account_id! },
  );
}
