import Flash from '@/components/Flash';
import { requireStudio } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatKr, VAT_OPTIONS } from '@/lib/money';
import { KIND_LABEL, Service } from '@/lib/types';
import { saveServiceAction } from '../../actions';

export const dynamic = 'force-dynamic';

const KIND_HELP: Record<string, string> = {
  class: 'Ett pass som bokas ett i taget. Lägg in tider under Kalender → + Pass.',
  course: 'Flera tillfällen som bokas och betalas på en gång. Skapa omgångar under + Kurs.',
  appointment: 'En-till-en. Kunden väljer själv en ledig tid inom dina öppettider.',
};

function ServiceForm({ s, kind }: { s?: Service; kind: Service['kind'] }) {
  return (
    <form action={saveServiceAction}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div className="grid2">
        <label className="field">
          <span>Namn</span>
          <input name="name" required defaultValue={s?.name} placeholder={kind === 'appointment' ? 'T.ex. Massage 60 min' : 'T.ex. Yin yoga'} />
        </label>
        <label className="field">
          <span>Längd (minuter)</span>
          <input name="duration_min" type="number" min={5} required defaultValue={s?.duration_min ?? 60} />
        </label>
        <label className="field">
          <span>Pris (kr){kind === 'course' ? ' för hela kursen' : ''}</span>
          <input name="price" inputMode="decimal" defaultValue={s ? String(s.price_ore / 100) : ''} placeholder="0" />
        </label>
        <label className="field">
          <span>Moms</span>
          <select name="vat_rate" defaultValue={String(s ? Number(s.vat_rate) : kind === 'appointment' ? 25 : 6)}>
            {VAT_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
          <span className="hint">Fråga din redovisningskonsult om du är osäker.</span>
        </label>
        {kind !== 'appointment' && (
          <label className="field">
            <span>Platser</span>
            <input name="capacity" type="number" min={1} defaultValue={s?.capacity ?? 12} />
          </label>
        )}
        {kind === 'course' && (
          <label className="field">
            <span>Antal tillfällen (förslag)</span>
            <input name="sessions_count" type="number" min={1} defaultValue={s?.sessions_count ?? 7} />
          </label>
        )}
        <label className="field">
          <span>Paus efter (minuter)</span>
          <input name="buffer_min" type="number" min={0} defaultValue={s?.buffer_min ?? (kind === 'appointment' ? 15 : 0)} />
          <span className="hint">Tid att städa eller vila innan nästa bokning.</span>
        </label>
      </div>
      <label className="field">
        <span>Beskrivning <small className="faint">(visas för kunderna)</small></span>
        <textarea name="description" defaultValue={s?.description ?? ''} rows={3} />
      </label>
      <label className="check mb2">
        <input type="checkbox" name="active" defaultChecked={s ? s.active : true} />
        <span>{kind === 'appointment' ? 'Bokningsbar på bokningssidan' : 'Aktiv (går att välja när du lägger in pass)'}</span>
      </label>
      <button className="btn primary">{s ? 'Spara' : 'Skapa mall'}</button>
    </form>
  );
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { studio } = await requireStudio();
  const { data } = await db().from('services').select('*').eq('studio_id', studio.id).order('sort').order('name');
  const services = (data ?? []) as Service[];
  const kinds: Service['kind'][] = ['class', 'course', 'appointment'];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mallar</h1>
          <p className="muted mb0">Det du erbjuder. Skapa en mall en gång – sedan går det på sekunder att lägga in pass och kurser.</p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {kinds.map((kind) => {
        const list = services.filter((s) => s.kind === kind);
        return (
          <section key={kind} className="mb3">
            <div className="section-title" style={{ marginTop: 18 }}>
              <h2>{kind === 'class' ? 'Drop-in-pass' : kind === 'course' ? 'Kurser' : 'Behandlingar'}</h2>
            </div>
            <p className="small muted">{KIND_HELP[kind]}</p>
            {list.map((s) => (
              <details key={s.id} className="box">
                <summary>
                  <span>
                    {s.name}{' '}
                    <span className="small muted" style={{ fontWeight: 400 }}>
                      · {s.duration_min} min · {formatKr(s.price_ore)}
                      {kind !== 'appointment' ? ` · ${s.capacity} platser` : ''}
                    </span>
                  </span>
                  {!s.active && <span className="badge">Inaktiv</span>}
                </summary>
                <div className="inner">
                  <ServiceForm s={s} kind={kind} />
                </div>
              </details>
            ))}
            <details className="box">
              <summary style={{ color: 'var(--accent)' }}>+ Ny mall: {KIND_LABEL[kind].toLowerCase()}</summary>
              <div className="inner">
                <ServiceForm kind={kind} />
              </div>
            </details>
          </section>
        );
      })}
    </>
  );
}
