import { NextResponse } from 'next/server';
import { notifyStudio } from '@/lib/booking';
import { audit, db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { syncSwish } from '@/lib/payments';
import { getStudioById } from '@/lib/studio';
import { Booking } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Swish meddelar här när en betalning eller återbetalning är klar.
// Innehållet litas inte på – vi frågar alltid Swish direkt (med certifikatet) om status.
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    // Återbetalning
    if (body?.originalPaymentReference) {
      if (body.status === 'ERROR' || body.status === 'DECLINED') {
        const { data } = await db()
          .from('bookings')
          .select('*, customers(*)')
          .eq('swish_payment_reference', String(body.originalPaymentReference))
          .maybeSingle();
        const b = data as Booking | null;
        if (b) {
          const studio = await getStudioById(b.studio_id);
          await audit(b.studio_id, 'swish', 'swish.refund.failed', { booking: b.id, errorCode: body.errorCode, errorMessage: body.errorMessage });
          if (studio) {
            await notifyStudio(studio, `Återbetalning misslyckades: ${b.title}`, [
              ['Kund', `${b.customers?.name ?? ''} <${b.customers?.email}>`],
              ['Belopp', body.amount ? formatKr(Math.round(Number(body.amount) * 100)) : '–'],
              ['Fel', `${body.errorCode ?? ''} ${body.errorMessage ?? ''}`.trim() || 'Okänt'],
              ['Gör så här', 'Swisha tillbaka beloppet manuellt till kunden.'],
            ]);
          }
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Betalning
    if (body?.id) {
      const { data } = await db().from('bookings').select('*, customers(*)').eq('swish_payment_id', String(body.id)).maybeSingle();
      const b = data as Booking | null;
      if (b) {
        const studio = await getStudioById(b.studio_id);
        if (studio) await syncSwish(b, studio);
      }
    }
  } catch (e: any) {
    console.error('Swish-callback', e?.message);
  }
  return NextResponse.json({ ok: true });
}
