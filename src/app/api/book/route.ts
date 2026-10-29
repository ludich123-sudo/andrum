import { NextResponse } from 'next/server';
import { BookingError, startBooking } from '@/lib/booking';
import { getStudioBySlug } from '@/lib/studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig förfrågan.' }, { status: 400 });
  }
  const studio = await getStudioBySlug(String(body.slug || ''));
  if (!studio) return NextResponse.json({ error: 'Studion finns inte.' }, { status: 404 });
  if (!body.acceptTerms) return NextResponse.json({ error: 'Godkänn bokningsvillkoren för att boka.' }, { status: 400 });
  if (body.website) return NextResponse.json({ error: 'Spam.' }, { status: 400 }); // honeypot

  const kind = body.kind;
  if (!['class', 'course', 'appointment'].includes(kind)) {
    return NextResponse.json({ error: 'Ogiltig bokningstyp.' }, { status: 400 });
  }
  try {
    const { url } = await startBooking({
      studio,
      kind,
      sessionId: body.sessionId ?? null,
      seriesId: body.seriesId ?? null,
      serviceId: body.serviceId ?? null,
      startsAt: body.startsAt ?? null,
      name: String(body.name ?? '').slice(0, 120),
      email: String(body.email ?? '').slice(0, 200),
      phone: String(body.phone ?? '').slice(0, 40),
      note: String(body.note ?? '').slice(0, 1000),
      voucherCode: String(body.voucherCode ?? '').slice(0, 40),
      waitlistToken: body.waitlistToken ?? null,
      source: 'online',
    });
    return NextResponse.json({ url });
  } catch (e: any) {
    const message = e instanceof BookingError ? e.message : 'Något gick fel. Försök igen om en stund.';
    if (!(e instanceof BookingError)) console.error('Bokningsfel', e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
