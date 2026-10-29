'use client';

import { useMemo, useState } from 'react';

type Template = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price_ore: number;
  capacity: number;
  sessions_count: number;
};

function addDays(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const dayFmt = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export default function CourseWizard({
  templates,
  today,
  action,
}: {
  templates: Template[];
  today: string;
  action: (f: FormData) => void;
}) {
  const [tplId, setTplId] = useState(templates[0]?.id ?? '');
  const tpl = templates.find((t) => t.id === tplId) ?? templates[0];
  const [start, setStart] = useState(addDays(today, 7));
  const [time, setTime] = useState('18:00');
  const [count, setCount] = useState(tpl?.sessions_count ?? 7);
  const [every, setEvery] = useState(7);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const dates = useMemo(() => {
    const out: string[] = [];
    let i = 0;
    let k = 0;
    while (out.length < count && k < 200) {
      const d = addDays(start, i * every);
      if (!skipped.has(d)) out.push(d);
      i++;
      k++;
    }
    return out;
  }, [start, count, every, skipped]);

  const allShown = useMemo(() => {
    // Visa även överhoppade datum (överstrukna) så att man kan ångra.
    const out: string[] = [];
    let i = 0;
    let taken = 0;
    while (taken < count && i < 200) {
      const d = addDays(start, i * every);
      out.push(d);
      if (!skipped.has(d)) taken++;
      i++;
    }
    return out;
  }, [start, count, every, skipped]);

  function toggle(d: string) {
    const next = new Set(skipped);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setSkipped(next);
  }

  if (!tpl) return null;

  return (
    <form action={action} onSubmit={() => setBusy(true)}>
      <div className="card">
        <h3>1. Vilken kurs?</h3>
        <label className="field">
          <span>Mall</span>
          <select
            name="service"
            value={tplId}
            onChange={(e) => {
              setTplId(e.target.value);
              const t = templates.find((x) => x.id === e.target.value);
              if (t) setCount(t.sessions_count);
            }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Kursens namn</span>
          <input name="name" key={`n-${tpl.id}`} defaultValue={tpl.name} required />
          <span className="hint">T.ex. "Yin yoga – hösten" så att kunderna ser skillnad på omgångarna.</span>
        </label>
        <div className="grid3">
          <label className="field">
            <span>Pris för hela kursen (kr)</span>
            <input name="price" key={`p-${tpl.id}`} inputMode="decimal" defaultValue={String(tpl.price_ore / 100)} />
          </label>
          <label className="field">
            <span>Platser</span>
            <input name="capacity" key={`c-${tpl.id}`} type="number" min={1} defaultValue={tpl.capacity} />
          </label>
          <label className="field">
            <span>Längd per tillfälle (min)</span>
            <input name="duration" key={`d-${tpl.id}`} type="number" min={5} defaultValue={tpl.duration_min} />
          </label>
        </div>
        <label className="field">
          <span>Beskrivning <small className="faint">(visas på bokningssidan)</small></span>
          <textarea name="description" key={`t-${tpl.id}`} defaultValue={tpl.description ?? ''} rows={3} />
        </label>
      </div>

      <div className="card mt2">
        <h3>2. När?</h3>
        <div className="grid3">
          <label className="field">
            <span>Första tillfället</span>
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setSkipped(new Set()); }} required />
          </label>
          <label className="field">
            <span>Tid</span>
            <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <label className="field">
            <span>Antal tillfällen</span>
            <input type="number" min={1} max={52} value={count} onChange={(e) => setCount(Math.max(1, Math.min(52, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <label className="field">
          <span>Hur ofta</span>
          <select value={every} onChange={(e) => { setEvery(Number(e.target.value)); setSkipped(new Set()); }}>
            <option value={7}>Varje vecka</option>
            <option value={14}>Varannan vecka</option>
            <option value={1}>Varje dag</option>
          </select>
        </label>

        <p className="label mt2">Datum – klicka på ett datum för att hoppa över det (t.ex. ett lov)</p>
        <ul className="datelist">
          {allShown.map((d) => {
            const off = skipped.has(d);
            return (
              <li key={d} className={off ? 'cancelled' : ''} style={{ cursor: 'pointer' }} onClick={() => toggle(d)}>
                <span style={{ textTransform: 'capitalize' }}>{dayFmt.format(new Date(d + 'T12:00:00Z'))}</span>
                <span className="muted small">{off ? 'Hoppas över – klicka för att ta med' : time}</span>
              </li>
            );
          })}
        </ul>
        {dates.map((d) => (
          <input key={d} type="hidden" name="dates" value={`${d}T${time}`} />
        ))}
        <label className="check mt2">
          <input type="checkbox" name="allow_late" />
          <span>Tillåt att man bokar in sig efter att kursen startat (fullt pris)</span>
        </label>
      </div>

      <div className="row mt3">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Skapar…' : `Skapa kursen med ${dates.length} tillfällen`}
        </button>
      </div>
    </form>
  );
}
