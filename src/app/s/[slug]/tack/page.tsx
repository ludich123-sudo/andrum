import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bookingSessions, getBookingByToken, syncFromStripe } from '@/lib/booking';
import { formatKr } from '@/lib/money';
import { getStudioBySlug } from '@/lib/studio';
import { capitalize, formatDay, formatTime } from '@/lib/tz';

export const dynamic = 'force-dynamic';

export default async function ThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ b?: string }>;
}) {
  const { slug } = await params;
  const { b } = await searchParams;
  const studio = await getStudioBySlug(slug);
  if (!studio || !b) notFound();
  let booking = await getBookingByToken(b);
  if (!booking || booking.studio_id !== studio.id) notFound();

  if (booking.status === 'pending') {
    await syncFromStripe(booking, studio);
    booking = (await getBookingByToken(b))!;
  }

  if (booking.status === 'pending') {
    return (
      <main className="mt4">
        <meta httpEquiv="refresh" content="3" />
        <div className="card center">
          <h2>Bekräftar din betalning…</h2>
          <p className="muted mb0">Det tar bara några sekunder. Sidan uppdateras automatiskt.</p>
        </div>
      </main>
    );
  }

  if (booking.status !== 'confirmed') {
    return (
      <main className="mt4">
        <div className="card center">
          <h2>Bokningen blev inte av</h2>
          <p className="muted">Betalningen hann inte genomföras och platsen har släppts.</p>
          <Link className="btn primary" href={`/s/${slug}`}>Försök igen</Link>
        </div>
      </main>
    );
  }

  const sessions = (await bookingSessions(booking)).filter((s) => s.status === 'scheduled');
  const tz = studio.timezone;

  return (
    <main className="mt4">
      <div className="card">
        <p className="badge ok mb2">✓ Bokat</p>
        <h1>Tack, {booking.customers?.name?.split(' ')[0] ?? 'välkommen'}!</h1>
        <p className="muted">
          Din bokning är klar. En bekräftelse har skickats till <strong>{booking.customers?.email}</strong>.
        </p>
        <div className="summary mt2">
          <div className="line">
            <strong>{booking.title}</strong>
            <span>{booking.paid_ore > 0 ? formatKr(booking.paid_ore) : ''}</span>
          </div>
          {sessions.slice(0, 12).map((s) => (
            <div className="line small muted" key={s.id}>
              <span>{capitalize(formatDay(new Date(s.starts_at), tz))}</span>
              <span>
                {formatTime(new Date(s.starts_at), tz)}–{formatTime(new Date(s.ends_at), tz)}
              </span>
            </div>
          ))}
        </div>
        <div className="row mt3">
          <a className="btn primary" href={`/api/ics/${booking.manage_token}`}>Lägg till i kalendern</a>
          <Link className="btn" href={`/s/${slug}/bokning/${booking.manage_token}`}>Hantera bokning</Link>
        </div>
      </div>
      <p className="center mt3">
        <Link href={`/s/${slug}`} className="muted">Tillbaka till {studio.name}</Link>
      </p>
    </main>
  );
}
