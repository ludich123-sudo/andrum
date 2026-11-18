import { NextResponse } from 'next/server';
import { getBookingByToken } from '@/lib/booking';
import { syncSwish } from '@/lib/payments';
import { bookingBaseUrl, getStudioById } from '@/lib/studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Betalsidan frågar här varannan sekund tills betalningen är klar.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('b') ?? '';
  const b = await getBookingByToken(token);
  if (!b) return NextResponse.json({ state: 'failed', message: 'Bokningen finns inte.' }, { status: 404 });
  const studio = await getStudioById(b.studio_id);
  if (!studio) return NextResponse.json({ state: 'failed', message: 'Studion finns inte.' }, { status: 404 });
  const thanks = `${bookingBaseUrl(studio)}/tack?b=${b.manage_token}`;

  if (b.status === 'confirmed') return NextResponse.json({ state: 'paid', redirect: thanks });
  if (b.status !== 'pending') {
    return NextResponse.json({ state: 'expired', message: 'Reservationen har gått ut. Boka gärna igen.' });
  }
  if (b.swish_error) return NextResponse.json({ state: 'failed', message: b.swish_error });

  try {
    const r = await syncSwish(b, studio);
    if (r === 'paid') return NextResponse.json({ state: 'paid', redirect: thanks });
    if (r === 'failed') {
      const fresh = await getBookingByToken(token);
      return NextResponse.json({ state: 'failed', message: fresh?.swish_error ?? 'Betalningen gick inte igenom.' });
    }
  } catch (e: any) {
    console.error('Swish-status', e?.message);
  }
  return NextResponse.json({ state: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
}
