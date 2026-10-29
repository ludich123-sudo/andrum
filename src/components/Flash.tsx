// Visar bekräftelser och fel som skickas tillbaka efter en åtgärd (?ok= / ?err=).
export default function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  if (ok === 'skickat') return null;
  return (
    <>
      {ok && <div className="notice ok" role="status">{ok}</div>}
      {err && <div className="notice err" role="alert">{err}</div>}
    </>
  );
}
