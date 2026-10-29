import { env } from '@/lib/env';
import { loginAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const sent = sp.ok === 'skickat';
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brandmark">{env.platformName}</div>
        <p className="muted mb3">Bokningar för yoga och behandlingar</p>
        <div className="card">
          {sent ? (
            <>
              <h2>Kolla din e-post</h2>
              <p className="muted mb0">
                Om adressen har ett konto har vi skickat en inloggningslänk. Den gäller i 30 minuter.
              </p>
            </>
          ) : (
            <form action={loginAction}>
              <h2>Logga in</h2>
              {sp.err && <div className="notice err">{sp.err}</div>}
              <label className="field">
                <span>Din e-post</span>
                <input name="email" type="email" required autoComplete="email" autoFocus />
              </label>
              <button className="btn primary block">Skicka inloggningslänk</button>
              <p className="small faint mt2 mb0">Inga lösenord – du får en länk via e-post.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
