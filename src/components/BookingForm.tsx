'use client';

import { useState } from 'react';

type Props = {
  slug: string;
  kind: 'class' | 'course' | 'appointment';
  sessionId?: string;
  seriesId?: string;
  serviceId?: string;
  startsAt?: string | null;
  priceLabel: string;
  isFree: boolean;
  terms: string;
  allowVouchers: boolean;
  waitlistToken?: string | null;
  prefillEmail?: string;
  prefillName?: string;
  disabled?: boolean;
  submitLabel?: string;
};

export default function BookingForm(p: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || p.disabled) return;
    setError(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: p.slug,
          kind: p.kind,
          sessionId: p.sessionId,
          seriesId: p.seriesId,
          serviceId: p.serviceId,
          startsAt: p.startsAt,
          name: f.get('name'),
          email: f.get('email'),
          phone: f.get('phone'),
          note: f.get('note'),
          voucherCode: f.get('voucher'),
          acceptTerms: f.get('terms') === 'on',
          website: f.get('website'),
          waitlistToken: p.waitlistToken ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || 'Något gick fel. Försök igen.');
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Ingen kontakt. Kontrollera internetanslutningen och försök igen.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate={false}>
      {error && <div className="notice err" role="alert">{error}</div>}
      <label className="field">
        <span>Namn</span>
        <input name="name" required autoComplete="name" defaultValue={p.prefillName} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>E-post</span>
          <input name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={p.prefillEmail} />
        </label>
        <label className="field">
          <span>Telefon <small className="faint">(valfritt)</small></span>
          <input name="phone" type="tel" autoComplete="tel" inputMode="tel" />
        </label>
      </div>
      <label className="field">
        <span>Meddelande till studion <small className="faint">(valfritt)</small></span>
        <textarea name="note" rows={2} style={{ minHeight: 64 }} placeholder="T.ex. skador eller önskemål" />
      </label>
      <div className="hp" aria-hidden="true">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {p.allowVouchers && !p.isFree && (
        <div className="mb2">
          {showCode ? (
            <label className="field">
              <span>Tillgodo- eller presentkod</span>
              <input name="voucher" autoCapitalize="characters" placeholder="T.ex. 7KQ2MXPA" />
            </label>
          ) : (
            <button type="button" className="linklike small" onClick={() => setShowCode(true)}>
              Har du en tillgodo- eller presentkod?
            </button>
          )}
        </div>
      )}
      <label className="check mb2">
        <input type="checkbox" name="terms" required />
        <span className="small muted">{p.terms}</span>
      </label>
      <button className="btn primary block" disabled={busy || p.disabled} type="submit">
        {busy ? 'Ett ögonblick…' : p.submitLabel ?? (p.isFree ? 'Boka' : `Boka och betala ${p.priceLabel}`)}
      </button>
      {!p.isFree && (
        <p className="small faint center mt1 mb0">Du betalar säkert med Swish eller kort via Stripe.</p>
      )}
    </form>
  );
}
