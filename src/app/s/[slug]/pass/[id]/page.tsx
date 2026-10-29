import Link from 'next/link';
import { notFound } from 'next/navigation';
import BookingForm from '@/components/BookingForm';
import WaitlistForm from '@/components/WaitlistForm';
import { db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import { getStudioBySlug } from '@/lib/studio';
import { Service, Session } from '@/lib/types';
import { capitalize, formatDay, formatTime } from '@/lib/tz';
import { getOffer } from '@/lib/waitlist';

export const dynamic = 'force-dynamic';

export default async function ClassPage({
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
  const { data } = await db()
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('studio_id', studio.id)
    .eq('kind', 'class')
    .maybeSingle();
  if (!data) notFound();
  const session = data as Session;
  let service: Service | null = null;
  if (session.service_id) {
    const { data: sv } = await db().from('services').select('*').eq('id', session.service_id).maybeSingle();
    service = (sv as Service) ?? null;
  }
  const tz = studio.timezone;
  const settings = getSettings(studio.settings);
  const offer = await getOffer(sp.vantelista);
  const validOffer = offer && offer.session_id === session.id && offer.status === 'offered' ? offer : null;
  const { data: freeData } = await db().rpc('free_spots', { p_session: session.id, p_series: null, p_except_token: validOffer?.token ?? null });
  const free = Number(freeData ?? 0);
  const start = new Date(session.starts_at);
  const bookable = session.status === 'scheduled' && start.getTime() > Date.now();

  return (
    <main>
      <Link href={`/s/${slug}`} className="back">← {studio.name}</Link>
      <h1>{session.title}</h1>
      <p className="muted">
        {capitalize(formatDay(start, tz))} · {formatTime(start, tz)}–{formatTime(new Date(session.ends_at), tz)} ·{' '}
        {session.price_ore > 0 ? formatKr(session.price_ore) : 'Gratis'}
      </p>
      {service?.description && <p style={{ whiteSpace: 'pre-line' }}>{service.description}</p>}
      {session.note && <div className="notice info">{session.note}</div>}

      <div className="card mt2">
        {!bookable ? (
          <p className="mb0 muted">
            {session.status === 'cancelled' ? 'Passet är inställt.' : 'Passet har redan börjat och går inte att boka.'}
          </p>
        ) : free > 0 ? (
          <>
            <div className="row between mb2">
              <h3 className="mb0">Boka din plats</h3>
              <span className="badge">{free === 1 ? '1 plats kvar' : `${free} platser kvar`}</span>
            </div>
            {validOffer && <div className="notice ok">En plats är reserverad åt dig från väntelistan.</div>}
            <BookingForm
              slug={slug}
              kind="class"
              sessionId={session.id}
              priceLabel={formatKr(session.price_ore)}
              isFree={session.price_ore <= 0}
              terms={settings.terms}
              allowVouchers={settings.allowVouchers}
              waitlistToken={validOffer?.token ?? null}
              prefillEmail={validOffer?.email}
              prefillName={validOffer?.name ?? undefined}
            />
          </>
        ) : settings.waitlistEnabled ? (
          <WaitlistForm slug={slug} sessionId={session.id} />
        ) : (
          <p className="mb0 muted">Passet är fullbokat.</p>
        )}
      </div>
    </main>
  );
}
