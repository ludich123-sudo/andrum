import CopyButton from '@/components/CopyButton';
import { SWISH_PORTAL } from '@/lib/swish';
import { Studio } from '@/lib/types';
import {
  createSwishCsrAction,
  saveSwishCaAction,
  saveSwishCertAction,
  saveSwishNumberAction,
  setSwishModeAction,
  testSwishAction,
} from '../../actions';

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className="swish-step">
      <div className={`swish-step-n${done ? ' done' : ''}`}>{done ? '✓' : n}</div>
      <div className="grow">
        <h3 className="mb0">{title}</h3>
        <div className="mt1">{children}</div>
      </div>
    </div>
  );
}

export default function SwishSettings({ studio }: { studio: Studio }) {
  const hasNumber = !!studio.swish_number;
  const hasCsr = !!studio.swish_csr_pem && !!studio.swish_pending_key_enc;
  const hasCert = !!studio.swish_cert_pem && !!studio.swish_key_enc;
  const live = studio.swish_mode === 'live' && hasCert;
  const expires = studio.swish_cert_expires_at ? new Date(studio.swish_cert_expires_at) : null;
  const expiresSoon = expires && expires.getTime() - Date.now() < 45 * 86400_000;

  return (
    <div>
      <div className="row between mb2">
        <div>
          {live ? (
            <span className="badge ok">Live – riktiga Swish-betalningar</span>
          ) : studio.swish_mode === 'demo' ? (
            <span className="testbadge">Testläge – simulerade betalningar</span>
          ) : (
            <span className="badge warn">Avstängt – kunder kan inte betala</span>
          )}
        </div>
      </div>

      <p className="muted">
        Kunderna betalar med Swish direkt till ditt företagskonto. Pengarna kommer in direkt, och återbetalningar vid avbokning
        sköts automatiskt. Du behöver <strong>Swish Handel</strong> från din bank.
      </p>

      <Step n={1} done={hasNumber} title="Swishnummer">
        <p className="small muted">
          Ansök om <strong>Swish Handel</strong> i din internetbank för företag (ofta under Betalningar → Swish). Du får ett
          Swishnummer som börjar på 123.
        </p>
        <form action={saveSwishNumberAction} className="row">
          <input name="swish_number" defaultValue={studio.swish_number ?? ''} placeholder="123 456 78 90" inputMode="numeric" style={{ maxWidth: 220 }} />
          <button className="btn small">Spara</button>
        </form>
      </Step>

      <Step n={2} done={hasCert || hasCsr} title="Skapa certifikatbegäran">
        <p className="small muted">
          Ett certifikat är Swish sätt att veta att betalningarna kommer från dig. Tryck på knappen så skapas en kod som du
          sedan klistrar in hos Swish.
        </p>
        {!hasNumber ? (
          <p className="small faint">Fyll i Swishnumret först.</p>
        ) : hasCsr ? (
          <>
            <p className="label">Din certifikatbegäran</p>
            <textarea readOnly value={studio.swish_csr_pem!} rows={6} className="codebox" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }} />
            <div className="row mt1">
              <CopyButton text={studio.swish_csr_pem!} label="Kopiera koden" />
              <a
                className="btn small"
                download={`swish-${studio.swish_number}.csr`}
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(studio.swish_csr_pem!)}`}
              >
                Ladda ner som fil
              </a>
            </div>
          </>
        ) : (
          <form action={createSwishCsrAction}>
            <button className="btn primary small">{hasCert ? 'Skapa ny begäran (t.ex. när certifikatet ska förnyas)' : 'Skapa certifikatbegäran'}</button>
          </form>
        )}
      </Step>

      <Step n={3} done={hasCert} title="Hämta certifikatet hos Swish">
        <ol className="small" style={{ paddingLeft: 18, margin: '0 0 12px', lineHeight: 1.7 }}>
          <li>
            Gå till{' '}
            <a href={SWISH_PORTAL} target="_blank" rel="noreferrer">
              Swish certifikatportal
            </a>{' '}
            och logga in med BankID.
          </li>
          <li>Välj ditt Swishnummer och <strong>Skapa certifikat</strong> (eller "Nytt certifikat").</li>
          <li>Klistra in koden från steg 2 när du blir ombedd, eller ladda upp filen.</li>
          <li>Ladda ner certifikatet (en <strong>.pem</strong>-fil) och lägg in det här nedan.</li>
        </ol>
        {(hasCsr || hasCert) && (
          <form action={saveSwishCertAction} encType="multipart/form-data">
            <label className="field">
              <span>Certifikatfilen från Swish</span>
              <input type="file" name="certfile" accept=".pem,.crt,.cer,.txt" />
            </label>
            <label className="field">
              <span>…eller klistra in innehållet</span>
              <textarea name="cert" rows={4} placeholder="-----BEGIN CERTIFICATE-----" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }} />
            </label>
            <button className="btn primary small">Spara certifikatet</button>
          </form>
        )}
        {hasCert && expires && (
          <p className={`small mt1 ${expiresSoon ? '' : 'muted'}`} style={expiresSoon ? { color: 'var(--danger)' } : undefined}>
            Certifikatet gäller till {expires.toLocaleDateString('sv-SE')}.
            {expiresSoon ? ' Skapa ett nytt snart (steg 2 och 3) så att betalningarna inte stoppas.' : ''}
          </p>
        )}
      </Step>

      <Step n={4} done={live} title="Testa och gå live">
        <div className="row">
          <form action={testSwishAction}>
            <button className="btn small" disabled={!hasCert}>Testa anslutningen</button>
          </form>
          {live ? (
            <form action={setSwishModeAction}>
              <input type="hidden" name="mode" value="demo" />
              <button className="btn small ghost">Byt till testläge</button>
            </form>
          ) : (
            <form action={setSwishModeAction}>
              <input type="hidden" name="mode" value="live" />
              <button className="btn primary small" disabled={!hasCert}>Ta emot riktiga betalningar</button>
            </form>
          )}
        </div>
        <p className="small muted mt1 mb0">
          I testläget kan du prova hela bokningen utan att några pengar dras. Där finns knappar som låtsas att kunden godkänner i
          Swish. Tips: gör en riktig bokning på 1 kr när du gått live, och avboka den för att se att återbetalningen fungerar.
        </p>
        {studio.swish_mode !== 'off' && !live && (
          <form action={setSwishModeAction} className="mt1">
            <input type="hidden" name="mode" value="off" />
            <button className="btn small ghost">Stäng av onlinebetalning</button>
          </form>
        )}
        {studio.swish_mode === 'off' && (
          <form action={setSwishModeAction} className="mt1">
            <input type="hidden" name="mode" value="demo" />
            <button className="btn small">Slå på testläge</button>
          </form>
        )}
      </Step>

      <details className="mt2">
        <summary className="small muted" style={{ cursor: 'pointer' }}>Avancerat: Swish rot-certifikat</summary>
        <p className="small muted mt1">
          Behövs bara om anslutningstestet säger att Swish servercertifikat inte kunde verifieras. Klistra då in Swish
          rot-certifikat (finns i Swish dokumentation för Swish Handel).
        </p>
        <form action={saveSwishCaAction}>
          <textarea name="ca" rows={3} defaultValue={studio.swish_ca_pem ?? ''} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }} />
          <button className="btn small mt1">Spara</button>
        </form>
      </details>
    </div>
  );
}
