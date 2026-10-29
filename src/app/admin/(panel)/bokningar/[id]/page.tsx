import Link from 'next/link';
import { notFound } from 'next/navigation';
import Flash from '@/components/Flash';
import { BOOKING_STATUS } from '@/lib/admin';
import { requireStudio } from '@/lib/auth';
import { bookingSessions, getBooking } from '@/lib/booking';
import { formatKr, vatIncluded } from '@/lib/money';
import { manageUrl } from '@/lib/studio';
import { KIND_LABEL } from '@/lib/types';
import { capitalize, formatDay, formatTime } from '@/lib/tz';
import { adminCancelBookingAction, resendConfirmationAction } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function BookingAdminPage({
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
  const b = await getBooking(id);
  if (!b || b.studio_id !== studio.id) notFound();
  const sessions = await bookingSessions(b);
  const tz = studio.timezone;
  const st = BOOKING_STATUS[b.status];
  const refundable = Math.max(0, b.paid_ore - b.refunded_ore);

  return (
    <>
      <Link href="/admin/bokningar" className="back">← Bokningar</Link>
      <div className="page-head">
        <div>
          <span className={`badge ${st.cls}`}>{st.label}</span>
          <h1 className="mt1">{b.customers?.name || b.customers?.email}</h1>
          <p className="muted mb0">
            <a href={`mailto:${b.customers?.email}`}>{b.customers?.email}</a>
            {b.customers?.phone ? (
              <>
                {' · '}
                <a href={`tel:${b.customers.phone}`}>{b.customers.phone}</a>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="card">
        <div className="row between">
          <h3 className="mb0">{b.title}</h3>
          <span className="badge">{KIND_LABEL[b.kind]}</span>
        </div>
        <ul className="datelist mt1">
          {sessions.map((s) => (
            <li key={s.id} className={s.status === 'cancelled' ? 'cancelled' : ''}>
              <Link href={`/admin/pass/${s.id}`}>{capitalize(formatDay(new Date(s.starts_at), tz))}</Link>
              <span className="muted nowrap">{formatTime(new Date(s.starts_at), tz)}–{formatTime(new Date(s.ends_at), tz)}</span>
            </li>
          ))}
        </ul>
        {b.note && <div className="notice info mt2">💬 {b.note}</div>}
        <div className="summary mt2">
          <div className="line"><span>Pris</span><span>{formatKr(b.price_ore)}</span></div>
          {b.voucher_ore > 0 && <div className="line"><span>Tillgodo/presentkort</span><span>−{formatKr(b.voucher_ore)}</span></div>}
          <div className="line"><span>Betalt{b.payment_method ? ` (${b.payment_method})` : ''}</span><span>{formatKr(b.paid_ore)}</span></div>
          {b.paid_ore > 0 && (
            <div className="line small muted"><span>varav moms {Number(b.vat_rate)} %</span><span>{formatKr(vatIncluded(b.paid_ore, Number(b.vat_rate)))}</span></div>
          )}
          {b.refunded_ore > 0 && <div className="line"><span>Återbetalt</span><span>−{formatKr(b.refunded_ore)}</span></div>}
        </div>
        <p className="small faint mt2 mb0">
          Bokad {new Date(b.created_at).toLocaleString('sv-SE', { timeZone: tz })}
          {b.source === 'manual' ? ' · inbokad av studion' : ''}
          {b.cancelled_at ? ` · avbokad ${new Date(b.cancelled_at).toLocaleString('sv-SE', { timeZone: tz })}` : ''}
        </p>
      </div>

      {b.status === 'confirmed' && (
        <div className="mt3">
          <details className="box">
            <summary>Skicka bekräftelsen igen</summary>
            <div className="inner">
              <form action={resendConfirmationAction}>
                <input type="hidden" name="id" value={b.id} />
                <button className="btn">Skicka till {b.customers?.email}</button>
              </form>
              <p className="small faint mt2 mb0">Kundens egen länk: {manageUrl(studio, b.manage_token)}</p>
            </div>
          </details>
          <details className="box">
            <summary style={{ color: 'var(--danger)' }}>Avboka</summary>
            <div className="inner">
              <form action={adminCancelBookingAction}>
                <input type="hidden" name="id" value={b.id} />
                <fieldset className="mb2">
                  <p className="label">Vad ska kunden få?</p>
                  <label className="check mb2">
                    <input type="radio" name="refund" value="money" defaultChecked disabled={refundable <= 0 && b.voucher_ore <= 0} />
                    <span>Pengarna tillbaka {refundable > 0 ? `(upp till ${formatKr(refundable)})` : ''}</span>
                  </label>
                  <label className="check mb2"><input type="radio" name="refund" value="credit" /> <span>Tillgodo (kod via e-post)</span></label>
                  <label className="check mb2"><input type="radio" name="refund" value="none" defaultChecked={refundable <= 0 && b.voucher_ore <= 0} /> <span>Ingenting</span></label>
                </fieldset>
                <label className="field">
                  <span>Belopp (kr) <small className="faint">– lämna tomt för hela beloppet</small></span>
                  <input name="amount" inputMode="decimal" placeholder={String((refundable + b.voucher_ore) / 100)} />
                </label>
                <label className="field">
                  <span>Meddelande till kunden</span>
                  <textarea name="message" />
                </label>
                <label className="check mb2">
                  <input type="checkbox" name="notify" defaultChecked />
                  <span>Mejla kunden</span>
                </label>
                <button className="btn danger solid">Avboka</button>
              </form>
            </div>
          </details>
        </div>
      )}
    </>
  );
}
