import Flash from '@/components/Flash';
import { requireSuperadmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { healthChecks, runSetup } from '@/lib/system';
import { getConfig } from '@/lib/db';
import { isTestMode, webhookSecret } from '@/lib/stripe';
import { Studio } from '@/lib/types';
import { runSetupAction, superCreateStudioAction, superOpenStudioAction, superUpdateStudioAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function SystemPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  // Första besöket: installera automatiken och Stripe-webhooken utan knapptryck.
  let autoRan: string[] = [];
  try {
    if (!(await getConfig('cron_url')) || (env.stripeSecretKey && !(await webhookSecret()))) autoRan = await runSetup();
  } catch {
    /* visas i checklistan */
  }
  const checks = await healthChecks();
  const allOk = checks.every((c) => c.ok);
  let studios: Studio[] = [];
  let members: { studio_id: string; email: string }[] = [];
  try {
    studios = ((await db().from('studios').select('*').order('created_at')).data ?? []) as Studio[];
    members = ((await db().from('studio_members').select('studio_id, email')).data ?? []) as any[];
  } catch {
    /* databasen inte installerad */
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>System</h1>
          <p className="muted mb0">Bara du ser den här sidan.</p>
        </div>
        <form action={runSetupAction}>
          <button className="btn primary">Kör installation</button>
        </form>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {autoRan.length > 0 && <div className="notice info">Installerade automatiskt: {autoRan.join(' · ')}</div>}
      {env.stripeSecretKey && isTestMode() && <div className="notice warn">Stripe körs i testläge.</div>}
      <div className={`notice ${allOk ? 'ok' : 'warn'}`}>
        {allOk ? 'Allt fungerar.' : 'Något behöver åtgärdas – se listan nedan. Tryck på "Kör installation" först.'}
      </div>

      <div className="tablewrap mb3">
        <table className="tbl">
          <tbody>
            {checks.map((c) => (
              <tr key={c.label}>
                <td style={{ width: 28 }}>{c.ok ? '✅' : '⚠️'}</td>
                <td><strong>{c.label}</strong><br /><span className="small muted">{c.detail}</span></td>
                <td className="small">{c.fix ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Studios</h2>
      {studios.map((st) => (
        <details key={st.id} className="box">
          <summary>
            <span>
              {st.name} <span className="small muted" style={{ fontWeight: 400 }}>/{st.slug}</span>
            </span>
            {st.stripe_charges_enabled ? <span className="badge ok">Stripe klar</span> : <span className="badge warn">Ingen Stripe</span>}
          </summary>
          <div className="inner">
            <p className="small muted">
              Ägare: {members.filter((m) => m.studio_id === st.id).map((m) => m.email).join(', ') || '–'}
            </p>
            <form action={superUpdateStudioAction}>
              <input type="hidden" name="id" value={st.id} />
              <div className="grid3">
                <label className="field"><span>Plattformsavgift (%)</span><input name="fee" defaultValue={String(st.platform_fee_percent)} /></label>
                <label className="field"><span>Egen domän</span><input name="domain" defaultValue={st.custom_domain ?? ''} placeholder="boka.studio.se" /></label>
                <label className="field"><span>Lägg till ägare (e-post)</span><input name="member" type="email" /></label>
              </div>
              <p className="small faint">
                Egen domän: lägg först till domänen i Vercel (Project → Settings → Domains) och en CNAME hos kundens domänleverantör
                som pekar på cname.vercel-dns.com.
              </p>
              <button className="btn small">Spara</button>
            </form>
            <form action={superOpenStudioAction} className="mt1">
              <input type="hidden" name="id" value={st.id} />
              <button className="btn small ghost">Öppna adminpanelen för {st.name} →</button>
            </form>
          </div>
        </details>
      ))}

      <details className="box mt2">
        <summary style={{ color: 'var(--accent)' }}>+ Skapa studio åt en kund</summary>
        <div className="inner">
          <form action={superCreateStudioAction}>
            <div className="grid3">
              <label className="field"><span>Studions namn</span><input name="name" required /></label>
              <label className="field"><span>Adress (slug)</span><input name="slug" placeholder="studionamn" /></label>
              <label className="field"><span>Ägarens e-post</span><input name="owner" type="email" required /></label>
            </div>
            <button className="btn primary">Skapa</button>
          </form>
        </div>
      </details>
    </>
  );
}
