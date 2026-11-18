// Betalningar oberoende av leverantör: Swish Handel (standard) eller Stripe (valfritt).
import { audit, db } from './db';
import { env } from './env';
import { getSettings } from './settings';
import { expireCheckout, refundPayment, retrieveCheckout } from './stripe';
import {
  cancelSwishPayment,
  createSwishPayment,
  createSwishRefund,
  decryptSecret,
  getSwishPayment,
  newInstructionId,
  SwishCreds,
  swishErrorText,
} from './swish';
import { Booking, Studio } from './types';

export const swishCallbackUrl = () => `${env.appUrl}/api/swish/callback`;

export function paymentProvider(studio: Studio): 'swish' | 'stripe' {
  return getSettings(studio.settings).paymentProvider === 'stripe' ? 'stripe' : 'swish';
}

export function swishCreds(studio: Studio): SwishCreds | null {
  if (!studio.swish_number || !studio.swish_cert_pem || !studio.swish_key_enc) return null;
  return {
    number: studio.swish_number,
    keyPem: decryptSecret(studio.swish_key_enc),
    certPem: studio.swish_cert_pem,
    caPem: studio.swish_ca_pem,
  };
}

/** 'live' = riktiga betalningar, 'demo' = simulerade testbetalningar, null = kan inte ta betalt. */
export function swishMode(studio: Studio): 'live' | 'demo' | null {
  if (studio.swish_mode === 'demo') return 'demo';
  if (studio.swish_mode === 'live' && studio.swish_number && studio.swish_cert_pem && studio.swish_key_enc) return 'live';
  return null;
}

export const isDemoPayment = (b: Booking) => !!b.swish_payment_id?.startsWith('DEMO');

/** Skapar (eller skapar om) en Swish-betalning för en väntande bokning. */
export async function startSwishPayment(studio: Studio, booking: Booking, payerPhone?: string | null) {
  const mode = swishMode(studio);
  if (!mode) throw new Error('Studion kan inte ta emot Swish-betalningar just nu. Kontakta studion direkt.');

  const previous = booking.swish_payment_id;
  let id: string;
  let token: string | null = null;
  if (mode === 'demo') {
    id = 'DEMO' + newInstructionId().slice(4);
  } else {
    const creds = swishCreds(studio)!;
    if (previous && !previous.startsWith('DEMO')) await cancelSwishPayment(creds, previous);
    const res = await createSwishPayment(creds, {
      reference: booking.id,
      amountOre: booking.amount_ore,
      message: booking.title,
      callbackUrl: swishCallbackUrl(),
      payerPhone: payerPhone ?? null,
    });
    id = res.id;
    token = res.token;
  }
  // Ge kunden tid att betala, även om reservationen snart skulle gått ut.
  const minExpiry = Date.now() + 15 * 60_000;
  const expires = Math.max(minExpiry, booking.expires_at ? new Date(booking.expires_at).getTime() : 0);
  const { error } = await db()
    .from('bookings')
    .update({
      payment_provider: 'swish',
      swish_payment_id: id,
      swish_token: token,
      swish_requested_at: new Date().toISOString(),
      swish_error: null,
      expires_at: new Date(expires).toISOString(),
    })
    .eq('id', booking.id)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  return { id, token, mode };
}

export type SyncResult = 'paid' | 'pending' | 'failed';

/** Frågar Swish om betalningen och bekräftar bokningen om den är betald. */
export async function syncSwish(b: Booking, studio: Studio): Promise<SyncResult> {
  if (b.status === 'confirmed') return 'paid';
  if (b.status !== 'pending' || !b.swish_payment_id) return 'failed';
  if (b.swish_error) return 'failed';
  if (isDemoPayment(b)) return 'pending';
  const creds = swishCreds(studio);
  if (!creds) return 'pending';
  const st = await getSwishPayment(creds, b.swish_payment_id);
  if (st.status === 'PAID') {
    const { finalizeBooking } = await import('./booking');
    const amount = Math.round(Number(st.amount ?? 0) * 100) || b.amount_ore;
    await finalizeBooking(b.id, { paidOre: amount, method: 'Swish', provider: 'swish', swishReference: st.paymentReference ?? null });
    return 'paid';
  }
  if (st.status === 'DECLINED' || st.status === 'ERROR' || st.status === 'CANCELLED') {
    await db()
      .from('bookings')
      .update({ swish_error: swishErrorText(st.errorCode, st.status === 'CANCELLED' ? 'Betalningen avbröts.' : st.errorMessage) })
      .eq('id', b.id)
      .eq('swish_payment_id', b.swish_payment_id);
    return 'failed';
  }
  return 'pending';
}

/** Om webhooken eller callbacken dröjer: fråga betalleverantören direkt. */
export async function syncPayment(b: Booking, studio: Studio): Promise<SyncResult> {
  if (b.status === 'confirmed') return 'paid';
  if (b.status !== 'pending') return 'failed';
  try {
    if (b.payment_provider === 'swish') return await syncSwish(b, studio);
    if (b.stripe_checkout_id) {
      const cs: any = await retrieveCheckout(studio, b.stripe_checkout_id);
      if (cs.payment_status === 'paid') {
        const { finalizeBooking } = await import('./booking');
        await finalizeBooking(b.id, {
          paidOre: cs.amount_total ?? b.amount_ore,
          method: 'kort',
          provider: 'stripe',
          paymentIntent: typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id,
        });
        return 'paid';
      }
    }
  } catch (e) {
    console.error('Betalningssynk', e);
  }
  return 'pending';
}

/** Avbryter en påbörjad betalning (kunden gav upp eller reservationen gick ut). */
export async function abortPendingPayment(studio: Studio, b: Booking) {
  try {
    if (b.stripe_checkout_id) await expireCheckout(studio, b.stripe_checkout_id);
    if (b.swish_payment_id && !isDemoPayment(b)) {
      const creds = swishCreds(studio);
      if (creds) await cancelSwishPayment(creds, b.swish_payment_id);
    }
  } catch {
    /* betalningen var redan avslutad */
  }
}

/** Går det att skicka pengar tillbaka automatiskt för den här bokningen? */
export function canRefundMoney(b: Booking): boolean {
  if (b.payment_provider === 'swish') return isDemoPayment(b) || !!b.swish_payment_reference;
  return !!b.stripe_payment_intent;
}

/** Skickar tillbaka pengar till kunden via samma betalsätt. */
export async function refundBookingPayment(studio: Studio, b: Booking, amountOre: number, reason: string) {
  if (amountOre <= 0) return;
  if (b.payment_provider === 'swish') {
    if (isDemoPayment(b)) {
      await audit(studio.id, 'system', 'swish.refund.demo', { booking: b.id, amountOre });
      return;
    }
    const creds = swishCreds(studio);
    if (!creds) throw new Error('Swish är inte kopplat, så återbetalningen kan inte göras automatiskt.');
    if (!b.swish_payment_reference) throw new Error('Swish-referens saknas för betalningen.');
    const refundId = await createSwishRefund(creds, {
      originalPaymentReference: b.swish_payment_reference,
      amountOre,
      message: reason,
      callbackUrl: swishCallbackUrl(),
    });
    await audit(studio.id, 'system', 'swish.refund', { booking: b.id, amountOre, refundId });
    return;
  }
  if (b.stripe_payment_intent) {
    await refundPayment(studio, b.stripe_payment_intent, amountOre);
    return;
  }
  throw new Error('Det finns ingen betalning att återbetala.');
}

/** Cron: följ upp Swish-betalningar som väntar (om callbacken inte kom fram). */
export async function syncPendingSwish(limit = 50): Promise<number> {
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data } = await db()
    .from('bookings')
    .select('*, customers(*)')
    .eq('status', 'pending')
    .eq('payment_provider', 'swish')
    .not('swish_payment_id', 'is', null)
    .is('swish_error', null)
    .gte('created_at', since)
    .limit(limit);
  let n = 0;
  const studios = new Map<string, Studio | null>();
  const { getStudioById } = await import('./studio');
  for (const b of (data ?? []) as Booking[]) {
    if (isDemoPayment(b)) continue;
    if (!studios.has(b.studio_id)) studios.set(b.studio_id, await getStudioById(b.studio_id));
    const studio = studios.get(b.studio_id);
    if (!studio) continue;
    try {
      if ((await syncSwish(b, studio)) === 'paid') n++;
    } catch {
      /* nästa körning */
    }
  }
  return n;
}
