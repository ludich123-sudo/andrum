import Link from 'next/link';
import Flash from '@/components/Flash';
import { recentBookings, revenueSince, sessionsBetween, takenMap } from '@/lib/admin';
import { requireStudio } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { bookingBaseUrl } from '@/lib/studio';
import { KIND_LABEL } from '@/lib/types';
import { addDaysKey, capitalize, formatDay, formatDayShort, formatTime, toDateKey, zonedToUtc } from '@/lib/tz';

export const dynamic = 'force-dynamic';

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { studio } = await requireStudio();
  const tz = studio.timezone;
  const todayKey = toDateKey(new Date(), tz);
  const dayStart = zonedToUtc(todayKey, '00:00', tz);
  const weekEnd = zonedToUtc(addDaysKey(todayKey, 8), '00:00', tz);
  const monthStart = zonedToUtc(todayKey.slice(0, 8) + '01', '00:00', tz);

  const [sessions, recent, month, servicesCount] = await Promise.all([
    sessionsBetween(studio, dayStart, weekEnd),
    recentBookings(studio, 8),
    revenueSince(studio, monthStart),
    db().from('services').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id),
  ]);
  const visible = sessions.filter((s) => s.kind !== 'block');
  const taken = await takenMap(visible.map((s) => s.id));
  const today = visible.filter((s) => toDateKey(new Date(s.starts_at), tz) === todayKey);
  const upcoming = visible.filter((s) => toDateKey(new Date(s.starts_at), tz) !== todayKey);
  const weekBooked = visible.reduce((a, s) => a + (taken.get(s.id) ?? 0), 0);

  const setupSteps = [
    { done: !!studio.stripe_charges_enabled, label: 'Koppla Stripe för att ta betalt (Swish och kort)', href: '/admin/installningar#betalning' },
    { done: !!studio.address && !!studio.email, label: 'Fyll i adress och e-post', href: '/admin/installningar#uppgifter' },
    { done: (servicesCount.count ?? 0) > 0 && sessions.length > 0, label: 'Lägg in ditt första pass eller din första kurs', href: '/admin/kurs/ny' },
  ];
  const needsSetup = setupSteps.some((s) => !s.done);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted mb0">{capitalize(formatDay(new Date(), tz))}</p>
          <h1>Idag</h1>
        </div>
        <div className="row">
          <Link className="btn" href="/admin/pass/ny">+ Pass</Link>
          <Link className="btn primary" href="/admin/kurs/ny">+ Kurs</Link>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {needsSetup && (
        <div className="card mb3">
          <h3>Kom igång</h3>
          <div className="stack">
            {setupSteps.map((s) => (
              <div key={s.label} className="row">
                <span className={`badge ${s.done ? 'ok' : ''}`}>{s.done ? '✓' : '•'}</span>
                {s.done ? <span className="muted">{s.label}</span> : <Link href={s.href}>{s.label}</Link>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid3 mb3">
        <div className="stat">
          <div className="n">{today.length}</div>
          <div className="l">pass idag</div>
        </div>
        <div className="stat">
          <div className="n">{weekBooked}</div>
          <div className="l">bokade platser kommande 7 dagar</div>
        </div>
        <div className="stat">
          <div className="n">{formatKr(month.paid - month.refunded)}</div>
          <div className="l">intäkter denna månad</div>
        </div>
      </div>

      <h2>Idag</h2>
      <div className="list mb3">
        {today.length === 0 && <div className="empty">Inga pass idag.</div>}
        {today.map((s) => {
          const t = taken.get(s.id) ?? 0;
          return (
            <Link key={s.id} href={`/admin/pass/${s.id}`} className="item">
              <span className="time">{formatTime(new Date(s.starts_at), tz)}</span>
              <span className="grow">
                <strong>{s.title}</strong>
                <br />
                <span className="small muted">{KIND_LABEL[s.kind]}</span>
              </span>
              <span className="badge accent">
                {t}/{s.capacity}
              </span>
            </Link>
          );
        })}
      </div>

      <h2>Kommande 7 dagar</h2>
      <div className="list mb3">
        {upcoming.length === 0 && <div className="empty">Inget inlagt. <Link href="/admin/pass/ny">Lägg in ett pass</Link>.</div>}
        {upcoming.slice(0, 30).map((s) => {
          const t = taken.get(s.id) ?? 0;
          return (
            <Link key={s.id} href={`/admin/pass/${s.id}`} className="item">
              <span className="time" style={{ minWidth: 110 }}>
                {formatDayShort(new Date(s.starts_at), tz)} {formatTime(new Date(s.starts_at), tz)}
              </span>
              <span className="grow">{s.title}</span>
              <span className={`badge ${t >= s.capacity ? 'warn' : ''}`}>
                {t}/{s.capacity}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="row between">
        <h2 className="mb0">Senaste bokningarna</h2>
        <Link href="/admin/bokningar" className="small">Visa alla</Link>
      </div>
      <div className="list mt1">
        {recent.length === 0 && <div className="empty">Inga bokningar än. Dela länken {bookingBaseUrl(studio)}</div>}
        {recent.map((b) => (
          <Link key={b.id} href={`/admin/bokningar/${b.id}`} className="item">
            <span className="grow">
              <strong>{b.customers?.name || b.customers?.email}</strong>
              <br />
              <span className="small muted">{b.title}</span>
            </span>
            {b.status === 'cancelled' ? (
              <span className="badge danger">Avbokad</span>
            ) : (
              <span className="small muted nowrap">{formatKr(b.paid_ore)}</span>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
