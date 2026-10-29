import { NextResponse } from 'next/server';
import { finalizeBooking, getBooking } from '@/lib/booking';
import { db } from '@/lib/db';
import { paymentMethodLabel, stripe, webhookSecret } from '@/lib/stripe';
import { getStudioById } from '@/lib/studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const secret = await webhookSecret();
  if (!sig || !secret) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  let event: any;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (e: any) {
    return NextResponse.json({ error: `Bad signature: ${e?.message}` }, { status: 400 });
  }

  // Varje händelse hanteras bara en gång.
  const { error: dup } = await db().from('stripe_events').insert({ id: event.id, type: event.type });
  if (dup) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await handle(event);
  } catch (e: any) {
    // Ta bort markeringen så att Stripe kan försöka igen.
    await db().from('stripe_events').delete().eq('id', event.id);
    console.error('Webhook-fel', event.type, e);
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function handle(event: any) {
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (obj.payment_status !== 'paid') return; // Väntar på asynkron betalning.
      const bookingId = obj.metadata?.booking_id;
      if (!bookingId) return;
      const booking = await getBooking(bookingId);
      if (!booking) return;
      const studio = await getStudioById(booking.studio_id);
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id ?? null;
      const method = studio ? await paymentMethodLabel(studio, pi) : 'Stripe';
      await finalizeBooking(bookingId, { paidOre: obj.amount_total ?? 0, method, paymentIntent: pi });
      return;
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const bookingId = obj.metadata?.booking_id;
      if (!bookingId) return;
      const booking = await getBooking(bookingId);
      if (booking?.status === 'pending') {
        await db().rpc('release_booking', { p_booking: bookingId, p_status: 'expired', p_by: 'system' });
      }
      return;
    }
    case 'account.updated': {
      await db().from('studios').update({ stripe_charges_enabled: !!obj.charges_enabled }).eq('stripe_account_id', obj.id);
      return;
    }
    case 'charge.refunded': {
      // Återbetalning gjord direkt i Stripe → håll siffrorna i synk.
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
      if (pi) await db().from('bookings').update({ refunded_ore: obj.amount_refunded ?? 0 }).eq('stripe_payment_intent', pi);
      return;
    }
  }
}
