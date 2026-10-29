import Flash from '@/components/Flash';
import { requireStudio } from '@/lib/auth';
import { db } from '@/lib/db';
import { DAY_NAMES, getSettings } from '@/lib/settings';
import { isTestMode, refreshStripeStatus } from '@/lib/stripe';
import { bookingBaseUrl } from '@/lib/studio';
import { TEMPLATE_VARIABLES, TemplateKey, TEMPLATES } from '@/lib/templates';
import {
  connectStripeAction,
  logoutAction,
  refreshStripeAction,
  saveHoursAction,
  saveProfileAction,
  saveRulesAction,
  saveTemplateAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; stripe?: string }>;
}) {
  const sp = await searchParams;
  const { studio } = await requireStudio();
  let stripeReady = studio.stripe_charges_enabled;
  if (sp.stripe === 'klar' && studio.stripe_account_id) {
    try {
      stripeReady = await refreshStripeStatus(studio);
    } catch {
      /* visas som ej klar */
    }
  }
  const s = getSettings(studio.settings);
  const { data: tplRows } = await db().from('email_templates').select('*').eq('studio_id', studio.id);
  const custom = new Map((tplRows ?? []).map((r: any) => [r.key, r]));
  const url = bookingBaseUrl(studio);
  const buttonHtml = `<a href="${url}" style="display:inline-block;background:${studio.accent_color};color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-family:sans-serif">Boka här</a>`;

  return (
    <>
      <div className="page-head">
        <h1>Inställningar</h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {sp.stripe === 'klar' && stripeReady && <div className="notice ok">Stripe är kopplat. Nu kan kunderna betala med Swish och kort.</div>}

      <details className="box" id="betalning" open={!stripeReady}>
        <summary>
          Betalning (Swish och kort)
          {stripeReady ? <span className="badge ok">Klar</span> : <span className="badge warn">Inte kopplad</span>}
        </summary>
        <div className="inner">
          {isTestMode() && <div className="notice warn">Testläge: inga riktiga pengar dras. Använd Stripes testkort 4242 4242 4242 4242.</div>}
          {stripeReady ? (
            <>
              <p>Betalningarna går direkt till ditt Stripe-konto. Återbetalningar sköts härifrån automatiskt.</p>
              <p className="small muted">
                Swish slår du på i Stripe under Settings → Payment methods → Swish. Utbetalningar, kvitton och bokföringsunderlag
                hittar du i Stripe.
              </p>
              <form action={refreshStripeAction}><button className="btn small">Kontrollera kopplingen</button></form>
            </>
          ) : (
            <>
              <p>
                Koppla ett Stripe-konto så kan kunderna betala direkt när de bokar. Det tar ungefär 10 minuter och du behöver
                organisationsnummer, bankkonto och BankID till hands.
              </p>
              <div className="row">
                <form action={connectStripeAction}><button className="btn primary">{studio.stripe_account_id ? 'Fortsätt kopplingen' : 'Koppla Stripe'}</button></form>
                {studio.stripe_account_id && (
                  <form action={refreshStripeAction}><button className="btn">Jag är klar – kontrollera</button></form>
                )}
              </div>
            </>
          )}
        </div>
      </details>

      <details className="box" id="dela">
        <summary>Dela bokningssidan</summary>
        <div className="inner">
          <p className="label">Din bokningslänk</p>
          <div className="codebox mb2">{url}</div>
          <p className="small muted">
            Lägg länken i Instagram-bion, i mejlsignaturen och på hemsidan. För en snygg knapp på hemsidan, klistra in koden nedan
            (i ONE.com: lägg till ett HTML-block).
          </p>
          <div className="codebox">{buttonHtml}</div>
          <p className="small faint mt2 mb0">
            Vill du ha en egen adress som boka.dinsida.se? Hör av dig till den som administrerar systemet.
          </p>
        </div>
      </details>

      <details className="box" id="uppgifter">
        <summary>Studions uppgifter</summary>
        <div className="inner">
          <form action={saveProfileAction}>
            <div className="grid2">
              <label className="field"><span>Namn</span><input name="name" defaultValue={studio.name} required /></label>
              <label className="field"><span>E-post</span><input name="email" type="email" defaultValue={studio.email ?? ''} /><span className="hint">Kunderna svarar hit, och hit kommer notiser.</span></label>
              <label className="field"><span>Telefon</span><input name="phone" defaultValue={studio.phone ?? ''} /></label>
              <label className="field"><span>Adress</span><input name="address" defaultValue={studio.address ?? ''} placeholder="Gata 1, 123 45 Ort" /></label>
              <label className="field"><span>Organisationsnummer</span><input name="org_nr" defaultValue={studio.org_nr ?? ''} /><span className="hint">Visas på kvitton.</span></label>
              <label className="field"><span>Hemsida</span><input name="website" defaultValue={studio.website ?? ''} placeholder="https://" /></label>
              <label className="field"><span>Logga (webbadress till bild)</span><input name="logo_url" defaultValue={studio.logo_url ?? ''} placeholder="https://…/logga.png" /></label>
              <label className="field"><span>Färg</span><input name="accent_color" type="color" defaultValue={studio.accent_color} /></label>
            </div>
            <label className="field"><span>Kort beskrivning på bokningssidan</span><textarea name="description" defaultValue={studio.description ?? ''} rows={3} /></label>
            <button className="btn primary">Spara</button>
          </form>
        </div>
      </details>

      <details className="box">
        <summary>Öppettider för behandlingar</summary>
        <div className="inner">
          <p className="small muted">Kunderna kan bara boka behandlingar inom dessa tider, och aldrig när något annat ligger i kalendern.</p>
          <form action={saveHoursAction}>
            {s.openingHours.map((h) => (
              <div key={h.day} className="row mb2" style={{ gap: 10 }}>
                <label className="check" style={{ width: 120 }}>
                  <input type="checkbox" name={`open_${h.day}`} defaultChecked={h.open} />
                  <span>{DAY_NAMES[h.day]}</span>
                </label>
                <input type="time" name={`start_${h.day}`} defaultValue={h.start} step={300} style={{ width: 130 }} />
                <span className="muted">–</span>
                <input type="time" name={`end_${h.day}`} defaultValue={h.end} step={300} style={{ width: 130 }} />
              </div>
            ))}
            <label className="field" style={{ maxWidth: 320 }}>
              <span>Visa tider med</span>
              <select name="slotStepMin" defaultValue={String(s.slotStepMin)}>
                <option value="15">15 minuters mellanrum</option>
                <option value="30">30 minuters mellanrum</option>
                <option value="60">60 minuters mellanrum</option>
              </select>
            </label>
            <button className="btn primary">Spara öppettider</button>
          </form>
        </div>
      </details>

      <details className="box">
        <summary>Regler för bokning och avbokning</summary>
        <div className="inner">
          <form action={saveRulesAction}>
            <h3>Bokning</h3>
            <div className="grid2">
              <label className="field"><span>Hur långt fram kan man boka (dagar)</span><input type="number" name="bookingWindowDays" min={1} defaultValue={s.bookingWindowDays} /></label>
              <label className="field"><span>Senast så här många timmar innan (behandlingar)</span><input type="number" name="minNoticeHours" min={0} defaultValue={s.minNoticeHours} /></label>
            </div>
            <h3 className="mt2">Avbokning</h3>
            <div className="grid2">
              <label className="field"><span>Kostnadsfritt fram till (timmar före pass/behandling)</span><input type="number" name="cancelHoursSingle" min={0} defaultValue={s.cancelHoursSingle} /></label>
              <label className="field"><span>Kostnadsfritt fram till (dagar före kursstart)</span><input type="number" name="cancelDaysCourse" min={0} defaultValue={s.cancelDaysCourse} /></label>
            </div>
            <label className="field">
              <span>Vid avbokning i tid får kunden</span>
              <select name="refundMode" defaultValue={s.refundMode}>
                <option value="money">Pengarna tillbaka automatiskt</option>
                <option value="credit">Tillgodo (pengarna stannar hos dig)</option>
              </select>
            </label>
            <h3 className="mt2">Väntelista och påminnelser</h3>
            <label className="check mb2"><input type="checkbox" name="waitlistEnabled" defaultChecked={s.waitlistEnabled} /><span>Väntelista när det är fullt</span></label>
            <div className="grid2">
              <label className="field"><span>Hur länge en ledig plats reserveras (timmar)</span><input type="number" name="waitlistOfferHours" min={1} defaultValue={s.waitlistOfferHours} /></label>
              <label className="field"><span>Påminnelse så här många timmar före (0 = av)</span><input type="number" name="reminderHours" min={0} defaultValue={s.reminderHours} /></label>
            </div>
            <label className="check mb2"><input type="checkbox" name="notifyStudio" defaultChecked={s.notifyStudio} /><span>Mejla mig vid nya bokningar och avbokningar</span></label>
            <label className="check mb2"><input type="checkbox" name="allowVouchers" defaultChecked={s.allowVouchers} /><span>Kunder kan använda tillgodo- och presentkoder</span></label>
            <h3 className="mt2">Texter</h3>
            <label className="field"><span>Villkor som kunden godkänner vid bokning</span><textarea name="terms" defaultValue={s.terms} rows={3} /></label>
            <label className="field"><span>Extra info i alla bekräftelser <small className="faint">(t.ex. portkod eller vad man ska ta med)</small></span><textarea name="bookingNote" defaultValue={s.bookingNote} rows={2} /></label>
            <button className="btn primary">Spara regler</button>
          </form>
        </div>
      </details>

      <details className="box">
        <summary>Mailtexter</summary>
        <div className="inner">
          <p className="small muted">
            Ändra hur mejlen låter. Datum, plats, kvitto och knappar läggs alltid till automatiskt. Du kan använda:{' '}
            {TEMPLATE_VARIABLES.map((v) => (
              <code key={v.key} title={v.label} style={{ marginRight: 6 }}>{`{{${v.key}}}`}</code>
            ))}
          </p>
          {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => {
            const def = TEMPLATES[key];
            const c = custom.get(key) as any;
            return (
              <details key={key} className="box">
                <summary>
                  <span>{def.label}</span>
                  {c && <span className="badge accent">Ändrad</span>}
                </summary>
                <div className="inner">
                  <p className="small faint">{def.help}</p>
                  <form action={saveTemplateAction}>
                    <input type="hidden" name="key" value={key} />
                    <label className="field"><span>Ämne</span><input name="subject" defaultValue={c?.subject ?? def.subject} /></label>
                    <label className="field"><span>Text</span><textarea name="body" defaultValue={c?.body ?? def.body} rows={5} /></label>
                    <div className="row">
                      <button className="btn primary small">Spara</button>
                      {c && (
                        <button className="btn small ghost" name="reset" value="1">Återställ originaltexten</button>
                      )}
                    </div>
                  </form>
                </div>
              </details>
            );
          })}
        </div>
      </details>

      <details className="box">
        <summary>Konto</summary>
        <div className="inner">
          <p className="small muted">Tips: lägg adminpanelen på telefonens hemskärm (Dela → Lägg till på hemskärmen) så öppnas den som en app.</p>
          <form action={logoutAction}><button className="btn">Logga ut</button></form>
        </div>
      </details>
    </>
  );
}
