import Link from 'next/link';
import { notFound } from 'next/navigation';
import Flash from '@/components/Flash';
import { seriesParticipants, takenMap, waitlistFor } from '@/lib/admin';
import { requireStudio } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { bookingBaseUrl } from '@/lib/studio';
import { Series, Session } from '@/lib/types';
import { capitalize, formatDay, formatTime } from '@/lib/tz';
import { addParticipantAction, cancelSeriesAction, messageAction, updateSeriesAction } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function CourseAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { studio } = await requireStudio();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await db().from('series').select('*').eq('id', id).eq('studio_id', studio.id).maybeSingle();
  if (!data) notFound();
  const series = data as Series;
  const { data: rows } = await db().from('sessions').select('*').eq('series_id', id).order('starts_at');
  const sessions = (rows ?? []) as Session[];
  const [people, waiting, taken] = await Promise.all([
    seriesParticipants(id),
    waitlistFor({ seriesId: id }),
    takenMap(sessions.map((s) => s.id)),
  ]);
  const tz = studio.timezone;
  const back = `/admin/kurs/${id}`;
  const firstActive = sessions.find((s) => s.status === 'scheduled');
  const income = people.reduce((a, b) => a + b.paid_ore - b.refunded_ore, 0);
  const cancelled = series.status === 'cancelled';
  const publicUrl = `${bookingBaseUrl(studio)}/kurs/${series.id}`;

  return (
    <>
      <Link href="/admin/kalender" className="back">← Kalender</Link>
      <div className="page-head">
        <div>
          <span className="badge accent">Kurs</span>
          <h1 className="mt1">{series.name}</h1>
          <p className="muted mb0">
            {sessions.filter((s) => s.status === 'scheduled').length} tillfällen · {people.length}/{series.capacity} bokade ·{' '}
            {formatKr(series.price_ore)}
          </p>
        </div>
        <a className="btn" href={publicUrl} target="_blank" rel="noreferrer">Visa bokningssidan ↗</a>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {cancelled && <div className="notice warn">Kursen är inställd.</div>}

      <div className="grid3 mb3">
        <div className="stat">
          <div className="n">{people.length}</div>
          <div className="l">deltagare</div>
          <div className="meter"><i style={{ width: `${Math.min(100, (people.length / series.capacity) * 100)}%` }} /></div>
        </div>
        <div className="stat">
          <div className="n">{Math.max(0, series.capacity - people.length)}</div>
          <div className="l">lediga platser</div>
        </div>
        <div className="stat">
          <div className="n">{formatKr(income)}</div>
          <div className="l">intäkter</div>
        </div>
      </div>

      <h2>Tillfällen</h2>
      <div className="list mb3">
        {sessions.map((s) => (
          <Link key={s.id} href={`/admin/pass/${s.id}`} className="item">
            <span className="grow" style={s.status === 'cancelled' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
              {capitalize(formatDay(new Date(s.starts_at), tz))}
            </span>
            <span className="small muted nowrap">
              {formatTime(new Date(s.starts_at), tz)}–{formatTime(new Date(s.ends_at), tz)}
            </span>
            {s.status === 'scheduled' && <span className="badge">{taken.get(s.id) ?? 0} bokade</span>}
          </Link>
        ))}
      </div>

      <h2>Deltagare</h2>
      <div className="list mb3">
        {people.length === 0 && <div className="empty">Inga bokningar än. Dela länken: {publicUrl}</div>}
        {people.map((b) => (
          <Link key={b.id} href={`/admin/bokningar/${b.id}`} className="item">
            <span className="grow">
              <strong>{b.customers?.name || b.customers?.email}</strong>
              <br />
              <span className="small muted">
                {b.customers?.email}
                {b.customers?.phone ? ` · ${b.customers.phone}` : ''}
              </span>
            </span>
            <span className="small muted nowrap">{b.paid_ore > 0 ? formatKr(b.paid_ore) : b.payment_method}</span>
          </Link>
        ))}
      </div>

      {waiting.length > 0 && (
        <>
          <h3>Väntelista</h3>
          <div className="list mb3">
            {waiting.map((w, i) => (
              <div key={w.id} className="item">
                <span className="time">{i + 1}.</span>
                <span className="grow">{w.name || w.email}<br /><span className="small muted">{w.email}</span></span>
                <span className={`badge ${w.status === 'offered' ? 'accent' : ''}`}>{w.status === 'offered' ? 'Erbjuden plats' : 'Väntar'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!cancelled && (
        <>
          <details className="box">
            <summary>Lägg till deltagare</summary>
            <div className="inner">
              <form action={addParticipantAction}>
                <input type="hidden" name="kind" value="course" />
                <input type="hidden" name="series" value={series.id} />
                <input type="hidden" name="back" value={back} />
                <div className="grid2">
                  <label className="field"><span>Namn</span><input name="name" required /></label>
                  <label className="field"><span>E-post</span><input name="email" type="email" required /></label>
                  <label className="field"><span>Telefon</span><input name="phone" type="tel" /></label>
                  <label className="field">
                    <span>Betalning</span>
                    <select name="payment" defaultValue="onsite">
                      <option value="onsite">Betalar på annat sätt</option>
                      <option value="free">Gratis</option>
                    </select>
                  </label>
                </div>
                <button className="btn primary">Boka in</button>
              </form>
            </div>
          </details>

          {firstActive && people.length > 0 && (
            <details className="box">
              <summary>Skicka meddelande till alla i kursen</summary>
              <div className="inner">
                <form action={messageAction}>
                  <input type="hidden" name="id" value={firstActive.id} />
                  <input type="hidden" name="back" value={back} />
                  <label className="field"><span>Ämne</span><input name="subject" defaultValue={`Om ${series.name}`} /></label>
                  <label className="field"><span>Meddelande</span><textarea name="text" required /></label>
                  <button className="btn primary">Skicka till {people.length} deltagare</button>
                </form>
              </div>
            </details>
          )}

          <details className="box">
            <summary>Ändra namn, beskrivning eller platser</summary>
            <div className="inner">
              <form action={updateSeriesAction}>
                <input type="hidden" name="id" value={series.id} />
                <label className="field"><span>Namn</span><input name="name" defaultValue={series.name} required /></label>
                <label className="field"><span>Beskrivning</span><textarea name="description" defaultValue={series.description ?? ''} /></label>
                <label className="field"><span>Platser</span><input name="capacity" type="number" min={1} defaultValue={series.capacity} /></label>
                <label className="check mb2">
                  <input type="checkbox" name="allow_late" defaultChecked={series.allow_late_join} />
                  <span>Tillåt bokning efter kursstart</span>
                </label>
                <button className="btn">Spara</button>
              </form>
              <p className="small faint mt2 mb0">Vill du flytta ett enskilt tillfälle? Klicka på det i listan ovan.</p>
            </div>
          </details>

          <details className="box">
            <summary style={{ color: 'var(--danger)' }}>Ställ in hela kursen</summary>
            <div className="inner">
              <form action={cancelSeriesAction}>
                <input type="hidden" name="id" value={series.id} />
                <fieldset className="mb2">
                  <p className="label">Vad ska deltagarna få?</p>
                  <label className="check mb2"><input type="radio" name="refund" value="money" defaultChecked /> <span>Pengarna tillbaka</span></label>
                  <label className="check mb2"><input type="radio" name="refund" value="credit" /> <span>Tillgodo (kod via e-post)</span></label>
                  <label className="check mb2"><input type="radio" name="refund" value="none" /> <span>Ingenting</span></label>
                </fieldset>
                <label className="field">
                  <span>Meddelande</span>
                  <textarea name="message" placeholder="Förklara gärna varför." />
                </label>
                <button className="btn danger solid">Ställ in kursen</button>
              </form>
            </div>
          </details>
        </>
      )}
    </>
  );
}
