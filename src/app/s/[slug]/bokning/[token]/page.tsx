import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { bookingSessions, BookingError, customerCancel, getBookingByToken } from '@/lib/booking';
import { formatKr } from '@/lib/money';
import { decideCancellation } from '@/lib/policy';
import { getSettings } from '@/lib/settings';
import { getStudioBySlug } from '@/lib/studio';
import { capitalize, formatDay, formatTime } from '@/lib/tz';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Bokad', cls: 'ok' },
  pending: { label: 'Väntar på betalning', cls: 'warn' },
  cancelled: { label: 'Avbokad', cls: 'danger' },
  expired: { label: 'Inte genomförd', cls: '' },
};

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { slug, token } = await params;
  const sp = await searchParams;
  const studio = await getStudioBySlug(slug);
  if (!studio) notFound();
  const booking = await getBookingByToken(token);
  if (!booking || booking.studio_id !== studio.id) notFound();

  const tz = studio.timezone;
  const sessions = await bookingSessions(booking);
  const active = sessions.filter((s) => s.status === 'scheduled');
  const first = active[0] ?? sessions[0];
  const decision = decideCancellation({
    kind: booking.kind,
    status: booking.status,
    firstStart: new Date(first.starts_at),
    settings: getSettings(studio.settings),
    now: new Date(),
  });
  const st = STATUS[booking.status] ?? STATUS.expired;

  async function cancel() {
    'use server';
    const b = await getBookingByToken(token);
    const s = await getStudioBySlug(slug);
    if (!b || !s || b.studio_id !== s.id) return;
    let target = `/s/${slug}/bokning/${token}`;
    try {
      const outcome = await customerCancel(b, s);
      target += `?msg=${encodeURIComponent(outcome)}`;
    } catch (e: any) {
      const m = e instanceof BookingError ? e.message : 'Avbokningen kunde inte genomföras. Kontakta studion.';
      target += `?err=${encodeURIComponent(m)}`;
    }
    redirect(target);
  }

  return (
    <main>
      <Link href={`/s/${slug}`} className="back">← {studio.name}</Link>
      <h1>Din bokning</h1>
      {sp.msg && <div className="notice ok">{sp.msg}</div>}
      {sp.err && <div className="notice err">{sp.err}</div>}

      <div className="card">
        <div className="row between top">
          <div>
            <h3 className="mb0">{booking.title}</h3>
            <p className="muted small mb0">
              {booking.customers?.name} · {booking.customers?.email}
            </p>
          </div>
          <span className={`badge ${st.cls}`}>{st.label}</span>
        </div>
        <ul className="datelist mt2">
          {sessions.map((s) => (
            <li key={s.id} className={s.status === 'cancelled' ? 'cancelled' : ''}>
              <span>{capitalize(formatDay(new Date(s.starts_at), tz))}</span>
              <span className="nowrap muted">
                {formatTime(new Date(s.starts_at), tz)}–{formatTime(new Date(s.ends_at), tz)}
              </span>
            </li>
          ))}
        </ul>
        {studio.address && <p className="small muted mt1 mb0">Plats: {studio.address}</p>}
        {booking.paid_ore > 0 && (
          <p className="small muted mt1 mb0">
            Betalt {formatKr(booking.paid_ore)}
            {booking.refunded_ore > 0 ? ` · återbetalt ${formatKr(booking.refunded_ore)}` : ''}
          </p>
        )}
        {booking.status === 'confirmed' && (
          <div className="row mt2">
            <a className="btn" href={`/api/ics/${booking.manage_token}`}>Lägg till i kalendern</a>
          </div>
        )}
      </div>

      {booking.status === 'confirmed' && (
        <div className="card mt2">
          <h3>Avboka</h3>
          <p className="muted">{decision.reason}</p>
          {decision.allowed && (
            <details>
              <summary className="btn danger" style={{ listStyle: 'none', display: 'inline-flex' }}>
                Jag vill avboka
              </summary>
              <form action={cancel} className="mt2">
                <p className="small">Är du säker? Det går inte att ångra.</p>
                <button className="btn danger solid" type="submit">
                  {decision.refund === 'none' ? 'Ja, avboka utan återbetalning' : 'Ja, avboka'}
                </button>
              </form>
            </details>
          )}
          {!decision.allowed && studio.email && (
            <p className="small mb0">
              Frågor? Kontakta <a href={`mailto:${studio.email}`}>{studio.email}</a>.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
