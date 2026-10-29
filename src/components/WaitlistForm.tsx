'use client';

import { useState } from 'react';

export default function WaitlistForm(p: { slug: string; sessionId?: string; seriesId?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: p.slug,
          sessionId: p.sessionId,
          seriesId: p.seriesId,
          name: f.get('name'),
          email: f.get('email'),
          phone: f.get('phone'),
          website: f.get('website'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? { ok: true, text: data.message } : { ok: false, text: data.error || 'Något gick fel.' });
    } catch {
      setMsg({ ok: false, text: 'Ingen kontakt. Försök igen.' });
    }
    setBusy(false);
  }

  if (msg?.ok) return <div className="notice ok">{msg.text}</div>;

  return (
    <form onSubmit={onSubmit}>
      <p className="muted">
        Det är fullbokat just nu. Ställ dig på väntelistan så mejlar vi dig direkt om en plats blir ledig.
      </p>
      {msg && <div className="notice err">{msg.text}</div>}
      <label className="field">
        <span>Namn</span>
        <input name="name" required autoComplete="name" />
      </label>
      <div className="grid2">
        <label className="field">
          <span>E-post</span>
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label className="field">
          <span>Telefon <small className="faint">(valfritt)</small></span>
          <input name="phone" type="tel" autoComplete="tel" />
        </label>
      </div>
      <div className="hp" aria-hidden="true">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button className="btn primary block" disabled={busy}>
        {busy ? 'Ett ögonblick…' : 'Ställ mig på väntelistan'}
      </button>
    </form>
  );
}
