import { NextResponse } from 'next/server';
import { finalizeBooking, getBookingByToken } from '@/lib/booking';
import { db } from '@/lib/db';
import { isDemoPayment } from '@/lib/payments';
import { getStudioById } from '@/lib/studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Testläge: simulerar att kunden godkänner eller avbryter i Swish-appen.
// Fungerar bara när studion står i testläge och betalningen skapades i testläge.
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* tom */
  }
  const b = await getBookingByToken(String(body.b ?? ''));
  if (!b || b.status !== 'pending' || !isDemoPayment(b)) {
    return NextResponse.json({ error: 'Ingen testbetalning att hantera.' }, { status: 400 });
  }
  const studio = await getStudioById(b.studio_id);
  if (!studio || studio.swish_mode !== 'demo') {
    return NextResponse.json({ error: 'Studion är inte i testläge.' }, { status: 400 });
  }
  if (body.action === 'approve') {
    await finalizeBooking(b.id, {
      paidOre: b.amount_ore,
      method: 'Swish (test)',
      provider: 'swish',
      swishReference: `DEMO${b.swish_payment_id!.slice(4, 20)}`,
    });
    return NextResponse.json({ ok: true });
  }
  await db().from('bookings').update({ swish_error: 'Betalningen avbröts i Swish-appen (test).' }).eq('id', b.id);
  return NextResponse.json({ ok: true });
}
