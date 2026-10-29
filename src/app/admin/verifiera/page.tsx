import { env } from '@/lib/env';
import { verifyAction } from '../actions';

export const dynamic = 'force-dynamic';

// En knapp i stället för automatisk inloggning: e-postprogram som "förhandsgranskar"
// länkar ska inte kunna förbruka den.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brandmark">{env.platformName}</div>
        <div className="card mt2">
          <form action={verifyAction}>
            <h2>Välkommen tillbaka</h2>
            <input type="hidden" name="t" value={t ?? ''} />
            <button className="btn primary block">Logga in</button>
          </form>
        </div>
      </div>
    </div>
  );
}
