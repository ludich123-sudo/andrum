import { NextResponse } from 'next/server';
import { getBookingByToken } from '@/lib/booking';
import { startSwishPayment } from '@/lib/payments';
import { getStudioById } from '@/lib/studio';
import { normalizePhone, swishQrSvg } from '@/lib/swish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ny Swish-förfrågan för samma bokning: efter avbrott/tidsgräns, eller till ett mobilnummer.
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* tom */
  }
  const b = await getBookingByToken(String(body.b ?? ''));
  if (!b) return NextResponse.json({ error: 'Bokningen finns inte.' }, { status: 404 });
  if (b.status !== 'pending') return NextResponse.json({ error: 'Reservationen har gått ut. Boka gärna igen.' }, { status: 400 });
  const studio = await getStudioById(b.studio_id);
  if (!studio) return NextResponse.json({ error: 'Studion finns inte.' }, { status: 404 });

  let phone: string | null = null;
  if (body.phone) {
    phone = normalizePhone(String(body.phone));
    if (!phone) return NextResponse.json({ error: 'Skriv ett svenskt mobilnummer, t.ex. 070-123 45 67.' }, { status: 400 });
  }
  try {
    const r = await startSwishPayment(studio, b, phone);
    const qr = r.mode === 'live' && r.token && !phone ? await swishQrSvg(r.token) : null;
    return NextResponse.json({ token: r.token, qr, sentToPhone: !!phone });
  } catch (e: any) {
    console.error('Swish-retry', e?.message);
    return NextResponse.json({ error: 'Swish-betalningen kunde inte startas. Försök igen om en stund.' }, { status: 400 });
  }
}
