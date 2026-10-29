'use client';

import { useEffect, useMemo, useState } from 'react';
import BookingForm from './BookingForm';

type Props = {
  slug: string;
  serviceId: string;
  tz: string;
  days: { key: string; wd: string; d: string; m: string; open: boolean }[];
  priceLabel: string;
  isFree: boolean;
  terms: string;
  allowVouchers: boolean;
};

export default function AppointmentPicker(p: Props) {
  const firstOpen = useMemo(() => p.days.find((d) => d.open)?.key ?? p.days[0]?.key, [p.days]);
  const [date, setDate] = useState<string>(firstOpen);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat('sv-SE', { timeZone: p.tz, hour: '2-digit', minute: '2-digit' }),
    [p.tz],
  );
  const longFmt = useMemo(
    () => new Intl.DateTimeFormat('sv-SE', { timeZone: p.tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
    [p.tz],
  );

  useEffect(() => {
    let alive = true;
    setSlots(null);
    setChosen(null);
    fetch(`/api/slots?studio=${encodeURIComponent(p.slug)}&service=${p.serviceId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => alive && setSlots(d.slots ?? []))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [date, p.slug, p.serviceId]);

  const visible = p.days.slice(offset, offset + 14);

  return (
    <div>
      <div className="row between">
        <h3 className="mb0">Välj dag</h3>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn ghost small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 14))} aria-label="Tidigare dagar">
            ←
          </button>
          <button type="button" className="btn ghost small" disabled={offset + 14 >= p.days.length} onClick={() => setOffset(offset + 14)} aria-label="Senare dagar">
            →
          </button>
        </div>
      </div>
      <div className="datestrip mt1">
        {visible.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`datebtn${d.key === date ? ' on' : ''}`}
            style={!d.open ? { opacity: 0.4 } : undefined}
            onClick={() => setDate(d.key)}
          >
            <span className="wd">{d.wd}</span>
            <span className="d">{d.d}</span>
            <span className="m">{d.m}</span>
          </button>
        ))}
      </div>

      <h3 className="mt2">Välj tid</h3>
      {slots === null && <p className="muted">Hämtar lediga tider…</p>}
      {slots && slots.length === 0 && <p className="muted">Inga lediga tider den här dagen. Prova en annan dag.</p>}
      {slots && slots.length > 0 && (
        <div className="slots">
          {slots.map((s) => (
            <button key={s} type="button" className={`slot${chosen === s ? ' on' : ''}`} onClick={() => setChosen(s)}>
              {timeFmt.format(new Date(s))}
            </button>
          ))}
        </div>
      )}

      {chosen && (
        <div className="card flat mt3">
          <p className="mb2">
            <strong style={{ textTransform: 'capitalize' }}>{longFmt.format(new Date(chosen))}</strong>
          </p>
          <BookingForm
            slug={p.slug}
            kind="appointment"
            serviceId={p.serviceId}
            startsAt={chosen}
            priceLabel={p.priceLabel}
            isFree={p.isFree}
            terms={p.terms}
            allowVouchers={p.allowVouchers}
          />
        </div>
      )}
    </div>
  );
}
