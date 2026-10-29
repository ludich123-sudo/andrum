import Link from 'next/link';
import { notFound } from 'next/navigation';
import BookingForm from '@/components/BookingForm';
import WaitlistForm from '@/components/WaitlistForm';
import { db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import { getStudioBySlug } from '@/lib/studio';
import { Series, Session } from '@/lib/types';
import { capitalize, formatDay, formatTime } from '@/lib/tz';
import { getOffer } from '@/lib/waitlist';

export const dynamic = 'force-dynamic';

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ vantelista?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const studio = await getStudioBySlug(slug);
  if (!studio || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: series } = await db().from('series').select('*').eq('id', id).eq('studio_id', studio.id).maybeSingle();
  if (!series) notFound();
  const s = series as Series;
  const { data: rows } = await db().from('sessions').select('*').eq('series_id', s.id).order('starts_at');
  const sessions = (rows ?? []) as Session[];
  const active = sessions.filter((x) => x.status === 'scheduled');
  const tz = studio.timezone;
  const settings = getSettings(studio.settings);
  const offer = await getOffer(sp.vantelista);
  const validOffer =
    offer && offer.series_id === s.id && offer.status === 'offered' ? offer : null;
  const { data: freeData } = await db().rpc('free_spots', { p_session: null, p_series: s.id, p_except_token: validOffer?.token ?? null });
  const free = Number(freeData ?? 0);
  const now = Date.now();
  const started = active.length > 0 && new Date(active[0].starts_at).getTime() <= now;
  const bookable = s.status === 'active' && active.some((x) => new Date(x.starts_at).getTime() > now) && (!started || s.allow_late_join);
  const duration = active[0]
    ? Math.round((new Date(active[0].ends_at).getTime() - new Date(active[0].starts_at).getTime()) / 60000)
    : 0;

  return (
    <main>
      <Link href={`/s/${slug}`} className="back">← {studio.name}</Link>
      <h1>{s.name}</h1>
      <p className="muted">
        {active.length} tillfällen · {duration} min · {s.price_ore > 0 ? formatKr(s.price_ore) : 'Gratis'} för hela kursen
      </p>
      {s.description && <p style={{ whiteSpace: 'pre-line' }}>{s.description}</p>}

      <div className="card mt2">
        <h3>Datum</h3>
        <ul className="datelist">
          {sessions.map((x) => (
            <li key={x.id} className={x.status === 'cancelled' ? 'cancelled' : ''}>
              <span>{capitalize(formatDay(new Date(x.starts_at), tz))}</span>
              <span className="nowrap muted">
                {formatTime(new Date(x.starts_at), tz)}–{formatTime(new Date(x.ends_at), tz)}
              </span>
            </li>
          ))}
        </ul>
        <p className="small faint mt1 mb0">
          Du bokar och betalar hela kursen på en gång. Missar du ett tillfälle går det inte att ta igen.
        </p>
      </div>

      <div className="card mt2">
        {!bookable ? (
          <p className="mb0 muted">Kursen går inte längre att boka.</p>
        ) : free > 0 ? (
          <>
            <h3 className="mb2">Boka din plats</h3>
            {validOffer && <div className="notice ok">En plats är reserverad åt dig från väntelistan.</div>}
            <BookingForm
              slug={slug}
              kind="course"
              seriesId={s.id}
              priceLabel={formatKr(s.price_ore)}
              isFree={s.price_ore <= 0}
              terms={settings.terms}
              allowVouchers={settings.allowVouchers}
              waitlistToken={validOffer?.token ?? null}
              prefillEmail={validOffer?.email}
              prefillName={validOffer?.name ?? undefined}
            />
          </>
        ) : settings.waitlistEnabled ? (
          <WaitlistForm slug={slug} seriesId={s.id} />
        ) : (
          <p className="mb0 muted">Kursen är fullbokad.</p>
        )}
      </div>
    </main>
  );
}
