import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import SwishPay from '@/components/SwishPay';
import { bookingSessions, getBookingByToken } from '@/lib/booking';
import { formatKr } from '@/lib/money';
import { isDemoPayment, swishMode, syncSwish } from '@/lib/payments';
import { bookingBaseUrl, getStudioBySlug } from '@/lib/studio';
import { swishQrSvg } from '@/lib/swish';
import { capitalize, formatDay, formatTime } from '@/lib/tz';

export const dynamic = 'force-dynamic';

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ b?: string }>;
}) {
  const { slug } = await params;
  const { b: token } = await searchParams;
  const studio = await getStudioBySlug(slug);
  if (!studio || !token) notFound();
  let booking = await getBookingByToken(token);
  if (!booking || booking.studio_id !== studio.id) notFound();

  const base = bookingBaseUrl(studio);
  if (booking.status === 'pending' && booking.payment_provider === 'swish') {
    try {
      await syncSwish(booking, studio);
    } catch {
      /* betalsidan frågar igen */
    }
    booking = (await getBookingByToken(token))!;
  }
  if (booking.status === 'confirmed') redirect(`${base}/tack?b=${booking.manage_token}`);

  const sessions = (await bookingSessions(booking)).filter((s) => s.status === 'scheduled');
  const tz = studio.timezone;
  // Läget följer betalningen (en testbetalning förblir test även om studion bytt läge).
  const mode = isDemoPayment(booking) ? 'demo' : (swishMode(studio) ?? 'demo');
  const expired = booking.status !== 'pending';
  const qr = !expired && mode === 'live' && booking.swish_token ? await swishQrSvg(booking.swish_token) : null;

  return (
    <main className="mt4">
      <div className="card pay-card">
        <span className="eyebrow">Betala med Swish</span>
        <h1 className="mb0">{formatKr(booking.amount_ore)}</h1>
        <p className="muted">
          {booking.title}
          {sessions[0] ? ` · ${capitalize(formatDay(new Date(sessions[0].starts_at), tz))} ${formatTime(new Date(sessions[0].starts_at), tz)}` : ''}
          {booking.kind === 'course' && sessions.length > 1 ? ` · ${sessions.length} tillfällen` : ''}
        </p>
        <div className="pay-body">
          {expired ? (
            <div className="center">
              <p className="swish-status">Reservationen har gått ut</p>
              <p className="muted">Ingen betalning har gjorts. Boka gärna igen.</p>
              <Link className="btn primary" href={`/s/${slug}`}>Boka igen</Link>
            </div>
          ) : (
            <SwishPay
              manageToken={booking.manage_token}
              slug={slug}
              mode={mode}
              initialToken={booking.swish_token}
              initialQr={qr}
              initialError={booking.swish_error}
              returnUrl={`${base}/betala?b=${booking.manage_token}`}
            />
          )}
        </div>
      </div>
      {!expired && (
        <p className="center small mt2">
          <Link href={`/s/${slug}/avbruten?b=${booking.manage_token}`} className="muted">Avbryt och släpp platsen</Link>
        </p>
      )}
    </main>
  );
}
