'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  manageToken: string;
  slug: string;
  mode: 'live' | 'demo';
  initialToken: string | null;
  initialQr: string | null;
  initialError: string | null;
  returnUrl: string;
};

const appLink = (token: string, returnUrl: string) =>
  `swish://paymentrequest?token=${encodeURIComponent(token)}&callbackurl=${encodeURIComponent(returnUrl)}`;

const cleanSvg = (svg: string | null) => (svg ? svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '') : null);

export default function SwishPay(p: Props) {
  const [token, setToken] = useState<string | null>(p.initialToken);
  const [qr, setQr] = useState<string | null>(cleanSvg(p.initialQr));
  const [state, setState] = useState<'waiting' | 'failed' | 'expired' | 'paid'>(p.initialError ? 'failed' : 'waiting');
  const [message, setMessage] = useState<string | null>(p.initialError);
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentToPhone, setSentToPhone] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const opened = useRef<string | null>(null);

  useEffect(() => {
    setMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  }, []);

  // Öppna Swish-appen automatiskt på mobilen (en gång per betalning).
  useEffect(() => {
    if (!mobile || !token || p.mode !== 'live' || state !== 'waiting') return;
    let already = false;
    try {
      already = sessionStorage.getItem('swish-opened') === token;
      sessionStorage.setItem('swish-opened', token);
    } catch {
      /* privat läge */
    }
    if (!already && opened.current !== token) {
      opened.current = token;
      window.location.href = appLink(token, p.returnUrl);
    }
  }, [mobile, token, p.mode, p.returnUrl, state]);

  // Fråga servern om betalningen är klar.
  useEffect(() => {
    if (state !== 'waiting') return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/swish/status?b=${p.manageToken}`, { cache: 'no-store' });
        const d = await r.json();
        if (!alive) return;
        if (d.state === 'paid') {
          setState('paid');
          window.location.href = d.redirect;
        } else if (d.state === 'failed' || d.state === 'expired') {
          setState(d.state);
          setMessage(d.message);
        }
      } catch {
        /* försök igen */
      }
    };
    const id = setInterval(tick, 2000);
    tick();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [state, p.manageToken]);

  const retry = useCallback(
    async (phone?: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const r = await fetch('/api/swish/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ b: p.manageToken, phone }),
        });
        const d = await r.json();
        if (!r.ok) {
          setMessage(d.error);
          if (/gått ut/.test(d.error ?? '')) setState('expired');
          setBusy(false);
          return;
        }
        opened.current = null;
        try {
          sessionStorage.removeItem('swish-opened');
        } catch {
          /* */
        }
        setToken(d.token);
        setQr(cleanSvg(d.qr));
        setSentToPhone(!!d.sentToPhone);
        setPhoneOpen(false);
        setState('waiting');
      } catch {
        setMessage('Ingen kontakt. Kontrollera internetanslutningen.');
      }
      setBusy(false);
    },
    [p.manageToken],
  );

  const demo = async (action: 'approve' | 'decline') => {
    setBusy(true);
    await fetch('/api/swish/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ b: p.manageToken, action }),
    }).catch(() => null);
    setBusy(false);
  };

  if (state === 'paid') {
    return (
      <div className="center">
        <p className="swish-status ok">✓ Betalningen är klar</p>
        <p className="muted">Du skickas vidare…</p>
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="center">
        <p className="swish-status">Reservationen har gått ut</p>
        <p className="muted">{message ?? 'Platsen hölls en stund men hann släppas.'}</p>
        <a className="btn primary" href={`/s/${p.slug}`}>Boka igen</a>
      </div>
    );
  }

  return (
    <div>
      {p.mode === 'demo' && (
        <div className="notice warn">
          <strong>Testläge.</strong> Inga riktiga pengar dras. Använd knapparna nedan för att låtsas att kunden godkänner eller avbryter i Swish.
        </div>
      )}

      {state === 'failed' ? (
        <div className="center">
          <p className="swish-status">Betalningen gick inte igenom</p>
          <p className="muted">{message ?? 'Försök igen.'}</p>
          <button className="btn primary" disabled={busy} onClick={() => retry()}>
            {busy ? 'Ett ögonblick…' : 'Försök igen'}
          </button>
        </div>
      ) : p.mode === 'demo' ? (
        <div className="center">
          <div className="swish-spinner" aria-hidden />
          <p className="swish-status">Väntar på att du godkänner i Swish…</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" disabled={busy} onClick={() => demo('approve')}>Godkänn betalning (test)</button>
            <button className="btn" disabled={busy} onClick={() => demo('decline')}>Avbryt (test)</button>
          </div>
        </div>
      ) : sentToPhone || !token ? (
        <div className="center">
          <div className="swish-spinner" aria-hidden />
          <p className="swish-status">Öppna Swish-appen på din telefon</p>
          <p className="muted">Betalningen väntar där. Godkänn med BankID så är du klar.</p>
        </div>
      ) : mobile ? (
        <div className="center">
          <a className="btn primary swish-btn" href={appLink(token, p.returnUrl)}>Öppna Swish</a>
          <div className="swish-spinner mt3" aria-hidden />
          <p className="swish-status">Väntar på betalningen…</p>
          <p className="muted small">Godkänn i Swish-appen. Du kommer tillbaka hit automatiskt.</p>
        </div>
      ) : (
        <div className="center">
          {qr ? (
            <div className="swish-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          ) : (
            <p className="muted">QR-koden kunde inte visas. Skicka betalningen till ditt mobilnummer i stället.</p>
          )}
          <p className="swish-status">Skanna med Swish-appen</p>
          <p className="muted small">Öppna Swish, tryck på QR-ikonen och rikta kameran mot koden.</p>
        </div>
      )}

      {p.mode === 'live' && state === 'waiting' && (
        <div className="center mt3">
          {phoneOpen ? (
            <form
              className="row"
              style={{ justifyContent: 'center' }}
              onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget).get('phone');
                retry(String(v ?? ''));
              }}
            >
              <input name="phone" type="tel" inputMode="tel" placeholder="070-123 45 67" required style={{ maxWidth: 220 }} autoFocus />
              <button className="btn" disabled={busy}>{busy ? '…' : 'Skicka till Swish'}</button>
            </form>
          ) : (
            <button className="linklike small" onClick={() => setPhoneOpen(true)}>
              {mobile ? 'Betala med Swish på en annan telefon' : 'Hellre skicka betalningen till ditt mobilnummer?'}
            </button>
          )}
          {message && state === 'waiting' && <p className="small mt1" style={{ color: 'var(--danger)' }}>{message}</p>}
        </div>
      )}
    </div>
  );
}
