import { redirect } from 'next/navigation';
import { myStudios, requireEmail } from '@/lib/auth';
import { env, isSuperadmin } from '@/lib/env';
import { logoutAction, onboardingAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const email = await requireEmail();
  const sp = await searchParams;
  const studios = await myStudios(email);
  if (studios.length) redirect('/admin');
  const canCreate = env.allowSignup || isSuperadmin(email);

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="brandmark">{env.platformName}</div>
        <div className="card mt2">
          {canCreate ? (
            <form action={onboardingAction}>
              <h2>Skapa din studio</h2>
              <p className="muted">Det tar en minut. Allt går att ändra senare.</p>
              {sp.err && <div className="notice err">{sp.err}</div>}
              <label className="field">
                <span>Studions namn</span>
                <input name="name" required placeholder="T.ex. Studio Andrum" autoFocus />
              </label>
              <label className="field">
                <span>Adress till bokningssidan</span>
                <input name="slug" placeholder="studio-andrum" pattern="[a-z0-9\-]{2,40}" />
                <span className="hint">Små bokstäver och bindestreck. Lämna tomt så skapas den från namnet.</span>
              </label>
              {isSuperadmin(email) && (
                <label className="field">
                  <span>Ägarens e-post</span>
                  <input name="owner" type="email" defaultValue={email} />
                  <span className="hint">Du är superadmin. Ange kundens e-post om du skapar studion åt någon annan – du ser alla studios ändå.</span>
                </label>
              )}
              <button className="btn primary block">Skapa studio</button>
            </form>
          ) : (
            <>
              <h2>Inget konto ännu</h2>
              <p className="muted">
                {email} är inte kopplad till någon studio. Be den som administrerar systemet att lägga till dig.
              </p>
            </>
          )}
          <form action={logoutAction} className="mt2">
            <button className="btn ghost small">Logga ut</button>
          </form>
        </div>
      </div>
    </div>
  );
}
