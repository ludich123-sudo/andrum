import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getBookingByToken } from '@/lib/booking';
import { db } from '@/lib/db';
import { abortPendingPayment, syncPayment } from '@/lib/payments';
import { getStudioBySlug } from '@/lib/studio';

export const dynamic = 'force-dynamic';

// Kunden avbröt betalningen. Platsen släpps direkt så att den inte blockeras i onödan.
export default async function AbortedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ b?: string }>;
}) {
  const { slug } = await params;
  const { b } = await searchParams;
  const studio = await getStudioBySlug(slug);
  if (!studio) notFound();
  const booking = b ? await getBookingByToken(b) : null;
  let backHref = `/s/${slug}`;
  if (booking && booking.studio_id === studio.id) {
    if (booking.status === 'pending') {
      // Hann kunden ändå betala? Då är bokningen klar.
      if ((await syncPayment(booking, studio)) === 'paid') redirect(`/s/${slug}/tack?b=${booking.manage_token}`);
      await abortPendingPayment(studio, booking);
      const fresh = await getBookingByToken(booking.manage_token);
      if (fresh?.status === 'pending') {
        await db().rpc('release_booking', { p_booking: booking.id, p_status: 'expired', p_by: 'customer' });
      }
    }
    if (booking.kind === 'course' && booking.series_id) backHref = `/s/${slug}/kurs/${booking.series_id}`;
    if (booking.kind === 'class' && booking.session_id) backHref = `/s/${slug}/pass/${booking.session_id}`;
  }
  return (
    <main className="mt4">
      <div className="card center">
        <span className="eyebrow">Avbrutet</span>
        <h2>Betalningen avbröts</h2>
        <p className="muted">Ingen bokning gjordes och inga pengar har dragits.</p>
        <Link className="btn primary" href={backHref}>Försök igen</Link>
      </div>
    </main>
  );
}
