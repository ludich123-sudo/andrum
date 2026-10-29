import Link from 'next/link';
import Flash from '@/components/Flash';
import { BOOKING_STATUS } from '@/lib/admin';
import { requireStudio } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatKr } from '@/lib/money';
import { Booking } from '@/lib/types';
import { createVoucherAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { studio } = await requireStudio();
  const q = (sp.q ?? '').trim();

  let bookings: Booking[] = [];
  if (q) {
    const safe = q.replace(/[%,()]/g, ' ');
    const { data: customers } = await db()
      .from('customers')
      .select('id')
      .eq('studio_id', studio.id)
      .or(`email.ilike.%${safe}%,name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      .limit(50);
    const ids = (customers ?? []).map((c) => c.id);
    if (ids.length) {
      const { data } = await db()
        .from('bookings')
        .select('*, customers(*)')
        .in('customer_id', ids)
        .neq('status', 'expired')
        .order('created_at', { ascending: false })
        .limit(100);
      bookings = (data ?? []) as Booking[];
    }
  } else {
    const { data } = await db()
      .from('bookings')
      .select('*, customers(*)')
      .eq('studio_id', studio.id)
      .neq('status', 'expired')
      .order('created_at', { ascending: false })
      .limit(60);
    bookings = (data ?? []) as Booking[];
  }

  const { data: vouchers } = await db()
    .from('vouchers')
    .select('*')
    .eq('studio_id', studio.id)
    .gt('balance_ore', 0)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <>
      <div className="page-head">
        <h1>Bokningar</h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <form className="row mb3" action="/admin/bokningar">
        <input name="q" defaultValue={q} placeholder="Sök på namn, e-post eller telefon" className="grow" style={{ flex: 1 }} />
        <button className="btn">Sök</button>
      </form>

      <div className="list mb3">
        {bookings.length === 0 && <div className="empty">{q ? 'Inga träffar.' : 'Inga bokningar än.'}</div>}
        {bookings.map((b) => {
          const st = BOOKING_STATUS[b.status];
          return (
            <Link key={b.id} href={`/admin/bokningar/${b.id}`} className="item">
              <span className="grow">
                <strong>{b.customers?.name || b.customers?.email}</strong>
                <br />
                <span className="small muted">
                  {b.title} · {new Date(b.created_at).toLocaleDateString('sv-SE', { timeZone: studio.timezone })}
                </span>
              </span>
              <span className="small muted nowrap">{b.paid_ore ? formatKr(b.paid_ore) : ''}</span>
              <span className={`badge ${st.cls}`}>{st.label}</span>
            </Link>
          );
        })}
      </div>

      <details className="box">
        <summary>Skapa tillgodo- eller presentkod</summary>
        <div className="inner">
          <form action={createVoucherAction}>
            <div className="grid2">
              <label className="field"><span>Mottagarens e-post</span><input name="email" type="email" required /></label>
              <label className="field"><span>Namn</span><input name="name" /></label>
              <label className="field"><span>Belopp (kr)</span><input name="amount" inputMode="decimal" required /></label>
              <label className="field">
                <span>Typ</span>
                <select name="kind" defaultValue="credit">
                  <option value="credit">Tillgodo</option>
                  <option value="gift">Presentkort</option>
                </select>
              </label>
            </div>
            <label className="field"><span>Anteckning (bara för dig)</span><input name="note" /></label>
            <button className="btn primary">Skapa och mejla koden</button>
          </form>
        </div>
      </details>

      {(vouchers ?? []).length > 0 && (
        <>
          <h3 className="mt3">Aktiva koder</h3>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr><th>Kod</th><th>Till</th><th>Saldo</th><th>Giltig till</th></tr>
              </thead>
              <tbody>
                {(vouchers ?? []).map((v: any) => (
                  <tr key={v.id}>
                    <td><code>{v.code}</code></td>
                    <td>{v.customer_email}</td>
                    <td>{formatKr(v.balance_ore)} av {formatKr(v.initial_ore)}</td>
                    <td>{v.expires_at ? new Date(v.expires_at).toLocaleDateString('sv-SE') : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
