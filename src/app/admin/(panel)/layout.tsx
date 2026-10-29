import { MobileNav, SideNav } from '@/components/AdminNav';
import { requireStudio } from '@/lib/auth';
import { bookingBaseUrl } from '@/lib/studio';
import { env } from '@/lib/env';
import { logoutAction, switchStudioAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { studio, studios, superadmin, email } = await requireStudio();
  const accent = /^#[0-9a-f]{3,8}$/i.test(studio.accent_color) ? studio.accent_color : '#5b7a5e';
  return (
    <div className="admin themed" style={{ ['--accent' as any]: accent }}>
      <aside className="admin-nav">
        <SideNav studioName={studio.name} platform={env.platformName} superadmin={superadmin} />
        <div className="spacer" />
        <a className="nav" href={bookingBaseUrl(studio)} target="_blank" rel="noreferrer">
          <span aria-hidden>↗</span> Bokningssidan
        </a>
        {studios.length > 1 && (
          <form action={switchStudioAction} className="mt1">
            <select name="studio" defaultValue={studio.id} aria-label="Byt studio">
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn small block mt1">Byt studio</button>
          </form>
        )}
        <form action={logoutAction}>
          <button className="btn ghost small block mt1" title={email}>
            Logga ut
          </button>
        </form>
      </aside>
      <main className="admin-main">{children}</main>
      <MobileNav />
    </div>
  );
}
