import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppointmentPicker from '@/components/AppointmentPicker';
import { db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import { getStudioBySlug } from '@/lib/studio';
import { Service } from '@/lib/types';
import { addDaysKey, toDateKey, weekdayOfKey, zonedToUtc } from '@/lib/tz';

export const dynamic = 'force-dynamic';

export default async function AppointmentPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const studio = await getStudioBySlug(slug);
  if (!studio || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await db()
    .from('services')
    .select('*')
    .eq('id', id)
    .eq('studio_id', studio.id)
    .eq('kind', 'appointment')
    .eq('active', true)
    .maybeSingle();
  if (!data) notFound();
  const service = data as Service;
  const settings = getSettings(studio.settings);
  const tz = studio.timezone;

  const today = toDateKey(new Date(), tz);
  const totalDays = Math.min(settings.bookingWindowDays, 120);
  const wdFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, weekday: 'short' });
  const mFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, month: 'short' });
  const days = Array.from({ length: totalDays }, (_, i) => {
    const key = addDaysKey(today, i);
    const noon = zonedToUtc(key, '12:00', tz);
    const oh = settings.openingHours.find((h) => h.day === weekdayOfKey(key));
    return {
      key,
      wd: wdFmt.format(noon).replace('.', ''),
      d: String(Number(key.slice(8))),
      m: mFmt.format(noon).replace('.', ''),
      open: !!oh?.open,
    };
  });

  return (
    <main>
      <Link href={`/s/${slug}`} className="back">← {studio.name}</Link>
      <h1>{service.name}</h1>
      <p className="muted">
        {service.duration_min} min · {service.price_ore > 0 ? formatKr(service.price_ore) : 'Gratis'}
      </p>
      {service.description && <p style={{ whiteSpace: 'pre-line' }}>{service.description}</p>}
      <div className="card mt2">
        <AppointmentPicker
          slug={slug}
          serviceId={service.id}
          tz={tz}
          days={days}
          priceLabel={formatKr(service.price_ore)}
          isFree={service.price_ore <= 0}
          terms={settings.terms}
          allowVouchers={settings.allowVouchers}
        />
      </div>
    </main>
  );
}
