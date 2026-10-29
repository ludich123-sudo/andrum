import Link from 'next/link';
import { notFound } from 'next/navigation';
import Flash from '@/components/Flash';
import { ATT_LABEL, participants, waitlistFor } from '@/lib/admin';
import { requireStudio } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { KIND_LABEL, Session } from '@/lib/types';
import { capitalize, formatDay, formatTime, toDateKey, toTimeKey } from '@/lib/tz';
import {
  addParticipantAction,
  cancelSessionAction,
  checkInAction,
  messageAction,
  moveSessionAction,
  updateSessionAction,
} from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function SessionPage({
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
  const { data } = await db().from('sessions').select('*').eq('id', id).eq('studio_id', studio.id).maybeSingle();
  if (!data) notFound();
  const s = data as Session;
  const tz = studio.timezone;
  const start = new Date(s.starts_at);
  const isBlock = s.kind === 'block';
  const people = isBlock ? [] : await participants(s);
  const waiting = s.kind === 'class' ? await waitlistFor({ sessionId: s.id }) : [];
  const cancelled = s.status === 'cancelled';
  const past = new Date(s.ends_at).getTime() < Date.now();
  const back = `/admin/pass/${s.id}`;

  return (
    <>
      <Link href={`/admin/kalender?v=${toDateKey(start, tz)}`} className="back">← Kalender</Link>
      <div className="page-head">
        <div>
          <span className="badge accent">{KIND_LABEL[s.kind]}</span>
          <h1 className="mt1">{s.title}</h1>
          <p className="muted mb0">
            {capitalize(formatDay(start, tz))} · {formatTime(start, tz)}–{formatTime(new Date(s.ends_at), tz)}
            {!isBlock && s.kind !== 'appointment' && ` · ${people.length}/${s.capacity} bokade`}
            {s.kind === 'class' && ` · ${formatKr(s.price_ore)}`}
          </p>
        </div>
        {s.series_id && (
          <Link className="btn" href={`/admin/kurs/${s.series_id}`}>Hela kursen →</Link>
        )}
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {cancelled && <div className="notice warn">Det här passet är inställt.</div>}

      {!isBlock && (
        <>
          <h2>Deltagare</h2>
          <div className="list mb3">
            {people.length === 0 && <div className="empty">Inga bokningar än.</div>}
            {people.map(({ booking: b, attendance }) => (
              <div key={b.id} className="item" style={{ flexWrap: 'wrap' }}>
                <span className="grow">
                  <Link href={`/admin/bokningar/${b.id}`}>
                    <strong>{b.customers?.name || b.customers?.email}</strong>
                  </Link>
                  <br />
                  <span className="small muted">
                    {b.customers?.email}
                    {b.customers?.phone ? ` · ${b.customers.phone}` : ''}
                    {b.paid_ore > 0 ? ` · betalt ${formatKr(b.paid_ore)}` : b.payment_method ? ` · ${b.payment_method}` : ''}
                  </span>
                  {b.note && <span className="small" style={{ display: 'block' }}>💬 {b.note}</span>}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <span className={`badge ${attendance.status === 'checked_in' ? 'ok' : attendance.status === 'no_show' ? 'danger' : ''}`}>
                    {ATT_LABEL[attendance.status]}
                  </span>
                  {!cancelled && (
                    <>
                      <form action={checkInAction}>
                        <input type="hidden" name="session" value={s.id} />
                        <input type="hidden" name="booking" value={b.id} />
                        <input type="hidden" name="status" value={attendance.status === 'checked_in' ? 'booked' : 'checked_in'} />
                        <button className="btn small">{attendance.status === 'checked_in' ? 'Ångra' : '✓ Här'}</button>
                      </form>
                      {attendance.status !== 'no_show' && past && (
                        <form action={checkInAction}>
                          <input type="hidden" name="session" value={s.id} />
                          <input type="hidden" name="booking" value={b.id} />
                          <input type="hidden" name="status" value="no_show" />
                          <button className="btn small ghost">Kom inte</button>
                        </form>
                      )}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>

          {waiting.length > 0 && (
            <>
              <h3>Väntelista</h3>
              <div className="list mb3">
                {waiting.map((w, i) => (
                  <div key={w.id} className="item">
                    <span className="time">{i + 1}.</span>
                    <span className="grow">
                      {w.name || w.email}
                      <br />
                      <span className="small muted">{w.email}</span>
                    </span>
                    <span className={`badge ${w.status === 'offered' ? 'accent' : ''}`}>
                      {w.status === 'offered' ? 'Erbjuden plats' : 'Väntar'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!cancelled && (
        <div className="mt3">
          {s.kind === 'class' && (
            <details className="box">
              <summary>Lägg till deltagare</summary>
              <div className="inner">
                <form action={addParticipantAction}>
                  <input type="hidden" name="kind" value="class" />
                  <input type="hidden" name="session" value={s.id} />
                  <input type="hidden" name="back" value={back} />
                  <div className="grid2">
                    <label className="field"><span>Namn</span><input name="name" required /></label>
                    <label className="field"><span>E-post</span><input name="email" type="email" required /></label>
                    <label className="field"><span>Telefon</span><input name="phone" type="tel" /></label>
                    <label className="field">
                      <span>Betalning</span>
                      <select name="payment" defaultValue="onsite">
                        <option value="onsite">Betalar på plats</option>
                        <option value="free">Gratis</option>
                      </select>
                    </label>
                  </div>
                  <button className="btn primary">Boka in</button>
                </form>
              </div>
            </details>
          )}

          {!isBlock && people.length > 0 && (
            <details className="box">
              <summary>Skicka meddelande till deltagarna</summary>
              <div className="inner">
                <form action={messageAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="back" value={back} />
                  <label className="field">
                    <span>Ämne</span>
                    <input name="subject" defaultValue={`Om ${s.title} ${formatDay(start, tz)}`} />
                  </label>
                  <label className="field">
                    <span>Meddelande</span>
                    <textarea name="text" required placeholder="T.ex. Ta med en filt i kväll." />
                  </label>
                  <button className="btn primary">Skicka till {s.series_id ? 'alla i kursen' : `${people.length} deltagare`}</button>
                </form>
              </div>
            </details>
          )}

          {(s.kind === 'class' || isBlock) && (
            <details className="box">
              <summary>Ändra namn, platser, pris eller info</summary>
              <div className="inner">
                <form action={updateSessionAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <div className="grid2">
                    <label className="field"><span>Namn</span><input name="title" defaultValue={s.title} /></label>
                    {!isBlock && (
                      <>
                        <label className="field"><span>Platser</span><input name="capacity" type="number" min={1} defaultValue={s.capacity} /></label>
                        <label className="field"><span>Pris (kr)</span><input name="price" defaultValue={String(s.price_ore / 100)} /></label>
                      </>
                    )}
                  </div>
                  <label className="field"><span>Info</span><input name="note" defaultValue={s.note ?? ''} /></label>
                  <button className="btn">Spara</button>
                </form>
              </div>
            </details>
          )}

          <details className="box">
            <summary>Flytta {s.kind === 'appointment' ? 'behandlingen' : 'passet'}</summary>
            <div className="inner">
              <form action={moveSessionAction}>
                <input type="hidden" name="id" value={s.id} />
                <div className="grid2">
                  <label className="field"><span>Nytt datum</span><input type="date" name="date" defaultValue={toDateKey(start, tz)} required /></label>
                  <label className="field"><span>Ny tid</span><input type="time" name="time" step={300} defaultValue={toTimeKey(start, tz)} required /></label>
                </div>
                {!isBlock && (
                  <label className="check mb2">
                    <input type="checkbox" name="notify" defaultChecked />
                    <span>Mejla de bokade om den nya tiden</span>
                  </label>
                )}
                <button className="btn">Flytta</button>
              </form>
            </div>
          </details>

          <details className="box">
            <summary style={{ color: 'var(--danger)' }}>{isBlock ? 'Ta bort blockeringen' : 'Ställ in'}</summary>
            <div className="inner">
              <form action={cancelSessionAction}>
                <input type="hidden" name="id" value={s.id} />
                {!isBlock && people.length > 0 && (
                  <>
                    <fieldset className="mb2">
                      <p className="label">Vad ska deltagarna få?</p>
                      <label className="check mb2"><input type="radio" name="refund" value="money" defaultChecked={s.kind !== 'course'} /> <span>Pengarna tillbaka</span></label>
                      <label className="check mb2"><input type="radio" name="refund" value="credit" /> <span>Tillgodo (kod via e-post)</span></label>
                      <label className="check mb2"><input type="radio" name="refund" value="none" defaultChecked={s.kind === 'course'} /> <span>Ingenting{s.kind === 'course' ? ' (vanligt för ett enstaka kurstillfälle)' : ''}</span></label>
                    </fieldset>
                    <label className="field">
                      <span>Meddelande till deltagarna</span>
                      <textarea name="message" placeholder="T.ex. Jag är tyvärr sjuk idag." />
                    </label>
                  </>
                )}
                <button className="btn danger solid">{isBlock ? 'Ta bort' : 'Ställ in och meddela'}</button>
              </form>
            </div>
          </details>
        </div>
      )}
    </>
  );
}
