import Link from 'next/link';
import Flash from '@/components/Flash';
import { sessionsBetween, takenMap } from '@/lib/admin';
import { requireStudio } from '@/lib/auth';
import { DAY_NAMES, getSettings } from '@/lib/settings';
import { KIND_LABEL } from '@/lib/types';
import {
  addDaysKey,
  capitalize,
  formatDay,
  formatTime,
  getParts,
  minutesOfTimeKey,
  mondayOfKey,
  toDateKey,
  zonedToUtc,
} from '@/lib/tz';

export const dynamic = 'force-dynamic';

const HOUR_PX = 48;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { studio } = await requireStudio();
  const tz = studio.timezone;
  const settings = getSettings(studio.settings);
  const todayKey = toDateKey(new Date(), tz);
  const anchor = sp.v && /^\d{4}-\d{2}-\d{2}$/.test(sp.v) ? sp.v : todayKey;
  const monday = mondayOfKey(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
  const from = zonedToUtc(days[0], '00:00', tz);
  const to = zonedToUtc(addDaysKey(days[6], 1), '00:00', tz);
  const sessions = await sessionsBetween(studio, from, to);
  const taken = await takenMap(sessions.map((s) => s.id));

  // Synligt intervall: öppettider och pass, minst 07–21.
  let minH = 7;
  let maxH = 21;
  for (const h of settings.openingHours.filter((x) => x.open)) {
    minH = Math.min(minH, Math.floor(minutesOfTimeKey(h.start) / 60));
    maxH = Math.max(maxH, Math.ceil(minutesOfTimeKey(h.end) / 60));
  }
  for (const s of sessions) {
    const a = getParts(new Date(s.starts_at), tz);
    const b = getParts(new Date(s.ends_at), tz);
    minH = Math.min(minH, a.hour);
    maxH = Math.max(maxH, Math.min(24, b.hour + (b.minute ? 1 : 0)));
  }
  const gridStart = minH * 60;
  const height = (maxH - minH) * HOUR_PX;
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);

  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = toDateKey(new Date(s.starts_at), tz);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  const weekLabel = `${formatDay(zonedToUtc(days[0], '12:00', tz), tz)} – ${formatDay(zonedToUtc(days[6], '12:00', tz), tz)}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kalender</h1>
          <p className="muted mb0">{weekLabel}</p>
        </div>
        <div className="row">
          <Link className="btn small" href={`/admin/kalender?v=${addDaysKey(monday, -7)}`} aria-label="Föregående vecka">←</Link>
          <Link className="btn small" href="/admin/kalender">Idag</Link>
          <Link className="btn small" href={`/admin/kalender?v=${addDaysKey(monday, 7)}`} aria-label="Nästa vecka">→</Link>
          <Link className="btn primary small" href={`/admin/pass/ny?datum=${anchor}`}>+ Pass</Link>
          <Link className="btn small" href="/admin/kurs/ny">+ Kurs</Link>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {/* Dator: veckovy */}
      <div className="cal">
        <div className="corner" />
        {days.map((d, i) => {
          const noon = zonedToUtc(d, '12:00', tz);
          return (
            <Link key={d} href={`/admin/pass/ny?datum=${d}`} className={`head${d === todayKey ? ' today' : ''}`} title="Lägg till pass">
              {DAY_NAMES[i + 1].slice(0, 3)}
              <b>{Number(d.slice(8))}</b>
              <span className="faint small">{noon.toLocaleDateString('sv-SE', { month: 'short', timeZone: tz })}</span>
            </Link>
          );
        })}
        <div className="hours" style={{ height }}>
          {hours.map((h) => (
            <span key={h} style={{ top: (h - minH) * HOUR_PX }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        {days.map((d, i) => {
          const oh = settings.openingHours.find((x) => x.day === i + 1);
          return (
            <div key={d} className={`col${oh?.open ? '' : ' closed'}`} style={{ height }}>
              {(byDay.get(d) ?? []).map((s) => {
                const a = getParts(new Date(s.starts_at), tz);
                const startMin = a.hour * 60 + a.minute;
                const dur = (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000;
                const top = ((startMin - gridStart) / 60) * HOUR_PX;
                const h = Math.max(22, (dur / 60) * HOUR_PX - 2);
                const t = taken.get(s.id) ?? 0;
                return (
                  <Link key={s.id} href={`/admin/pass/${s.id}`} className={`ev ${s.kind}`} style={{ top, height: h }}>
                    <b>
                      {formatTime(new Date(s.starts_at), tz)} {s.title}
                    </b>
                    {s.kind !== 'block' && (
                      <span>
                        {t}/{s.capacity}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--accent)' }} />Drop-in</span>
        <span><i style={{ background: '#b07a3c' }} />Kurs</span>
        <span><i style={{ background: '#5a6b9a' }} />Behandling</span>
        <span><i style={{ background: '#8a8e88' }} />Blockerad</span>
        <span className="faint">Klicka på en dag för att lägga till ett pass.</span>
      </div>

      {/* Mobil: lista per dag */}
      <div className="cal-mobile">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const noon = zonedToUtc(d, '12:00', tz);
          return (
            <div key={d} className="mb2">
              <div className="row between">
                <strong className={d === todayKey ? '' : ''} style={d === todayKey ? { color: 'var(--accent)' } : undefined}>
                  {capitalize(formatDay(noon, tz))}
                </strong>
                <Link className="btn ghost small" href={`/admin/pass/ny?datum=${d}`}>+ Pass</Link>
              </div>
              <div className="list mt1">
                {list.length === 0 && <div className="empty small">Inget inlagt</div>}
                {list.map((s) => (
                  <Link key={s.id} href={`/admin/pass/${s.id}`} className="item">
                    <span className="time">{formatTime(new Date(s.starts_at), tz)}</span>
                    <span className="grow">
                      {s.title}
                      <br />
                      <span className="small muted">{KIND_LABEL[s.kind]}</span>
                    </span>
                    {s.kind !== 'block' && (
                      <span className="badge">
                        {taken.get(s.id) ?? 0}/{s.capacity}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
