import Link from 'next/link';
import Flash from '@/components/Flash';
import { requireStudio } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { Service } from '@/lib/types';
import { toDateKey } from '@/lib/tz';
import { createSessionsAction } from '../../../actions';

export const dynamic = 'force-dynamic';

const REPEAT = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20];

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ datum?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { studio } = await requireStudio();
  const date = sp.datum && /^\d{4}-\d{2}-\d{2}$/.test(sp.datum) ? sp.datum : toDateKey(new Date(), studio.timezone);
  const { data } = await db()
    .from('services')
    .select('*')
    .eq('studio_id', studio.id)
    .eq('kind', 'class')
    .eq('active', true)
    .order('sort')
    .order('name');
  const templates = (data ?? []) as Service[];

  return (
    <>
      <div className="page-head">
        <h1>Nytt pass</h1>
        <Link href="/admin/kurs/ny" className="btn">Ska det vara en kurs? →</Link>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="card">
        <h3>Drop-in-pass</h3>
        <p className="muted small">Ett pass som bokas och betalas ett i taget.</p>
        {templates.length === 0 ? (
          <p>
            Du har ingen mall för drop-in-pass än. <Link href="/admin/tjanster">Skapa en mall</Link> först – sedan går det på
            sekunder.
          </p>
        ) : (
          <form action={createSessionsAction}>
            <input type="hidden" name="type" value="class" />
            <label className="field">
              <span>Mall</span>
              <select name="service" required defaultValue={templates[0].id}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.duration_min} min · {t.capacity} platser · {formatKr(t.price_ore)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid2">
              <label className="field">
                <span>Datum</span>
                <input type="date" name="date" defaultValue={date} required />
              </label>
              <label className="field">
                <span>Starttid</span>
                <input type="time" name="time" defaultValue="18:00" step={300} required />
              </label>
            </div>
            <label className="field">
              <span>Upprepa</span>
              <select name="repeat" defaultValue="1">
                {REPEAT.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'Bara en gång' : `Samma tid varje vecka, ${n} gånger`}
                  </option>
                ))}
              </select>
            </label>
            <details className="mb2">
              <summary className="small muted" style={{ cursor: 'pointer' }}>Ändra namn, längd, platser eller pris för just det här</summary>
              <div className="grid2 mt2">
                <label className="field">
                  <span>Namn</span>
                  <input name="title" placeholder="Som mallen" />
                </label>
                <label className="field">
                  <span>Längd (min)</span>
                  <input name="duration" type="number" min={5} placeholder="Som mallen" />
                </label>
                <label className="field">
                  <span>Platser</span>
                  <input name="capacity" type="number" min={1} placeholder="Som mallen" />
                </label>
                <label className="field">
                  <span>Pris (kr)</span>
                  <input name="price" inputMode="decimal" placeholder="Som mallen" />
                </label>
              </div>
              <label className="field">
                <span>Info till deltagarna</span>
                <input name="note" placeholder="T.ex. Ta med egen matta" />
              </label>
            </details>
            <button className="btn primary">Skapa pass</button>
          </form>
        )}
      </div>

      <details className="box mt2">
        <summary>Blockera tid (ledig, semester, privat)</summary>
        <div className="inner">
          <p className="muted small">Blockerad tid går inte att boka behandlingar på.</p>
          <form action={createSessionsAction}>
            <input type="hidden" name="type" value="block" />
            <label className="field">
              <span>Vad (syns bara för dig)</span>
              <input name="title" placeholder="T.ex. Ledig" />
            </label>
            <div className="grid3">
              <label className="field">
                <span>Datum</span>
                <input type="date" name="date" defaultValue={date} required />
              </label>
              <label className="field">
                <span>Från</span>
                <input type="time" name="time" defaultValue="09:00" step={300} required />
              </label>
              <label className="field">
                <span>Längd (min)</span>
                <input type="number" name="duration" defaultValue={480} min={5} />
              </label>
            </div>
            <label className="field">
              <span>Upprepa</span>
              <select name="repeat" defaultValue="1">
                {REPEAT.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'Bara en gång' : `Varje vecka, ${n} gånger`}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn">Blockera</button>
          </form>
        </div>
      </details>
    </>
  );
}
