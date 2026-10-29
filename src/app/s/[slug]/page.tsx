import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatKr } from '@/lib/money';
import { getAppointmentServices, getClasses, getCourses } from '@/lib/public';
import { getSettings } from '@/lib/settings';
import { getStudioBySlug } from '@/lib/studio';
import { formatDay, formatTime, toDateKey, weekdayPlural, capitalize } from '@/lib/tz';

export const dynamic = 'force-dynamic';

function spotsLabel(free: number) {
  if (free <= 0) return <span className="badge warn">Fullbokat · väntelista</span>;
  if (free <= 3) return <span className="badge accent">{free === 1 ? '1 plats kvar' : `${free} platser kvar`}</span>;
  return <span className="badge">{free} lediga platser</span>;
}

export default async function StudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = await getStudioBySlug(slug);
  if (!studio) notFound();
  const tz = studio.timezone;
  const settings = getSettings(studio.settings);

  const [courses, classes, services] = await Promise.all([
    getCourses(studio),
    getClasses(studio),
    getAppointmentServices(studio),
  ]);

  const byDay = new Map<string, typeof classes>();
  for (const c of classes) {
    const k = toDateKey(new Date(c.session.starts_at), tz);
    byDay.set(k, [...(byDay.get(k) ?? []), c]);
  }

  const empty = !courses.length && !classes.length && !services.length;

  return (
    <main>
      <header className="public-header">
        {studio.logo_url && <img className="logo" src={studio.logo_url} alt={studio.name} />}
        <h1 className="studio-name">{studio.name}</h1>
        {studio.description && <p className="muted mt1" style={{ maxWidth: 560 }}>{studio.description}</p>}
        <nav className="tabs" aria-label="Kategorier">
          {courses.length > 0 && <a href="#kurser">Kurser</a>}
          {classes.length > 0 && <a href="#pass">Pass</a>}
          {services.length > 0 && <a href="#behandlingar">Behandlingar</a>}
        </nav>
      </header>

      {empty && (
        <div className="card mt3 center">
          <h3>Inget att boka just nu</h3>
          <p className="muted mb0">Nya pass och kurser läggs upp löpande. Välkommen tillbaka snart!</p>
        </div>
      )}

      {courses.length > 0 && (
        <section id="kurser">
          <div className="section-title">
            <h2>Kurser</h2>
          </div>
          {courses.map(({ series, sessions, free, started }) => {
            const first = new Date(sessions[0].starts_at);
            const last = new Date(sessions[sessions.length - 1].starts_at);
            return (
              <Link key={series.id} href={`/s/${slug}/kurs/${series.id}`} className="card link">
                <div className="offer">
                  <div className="grow">
                    <h3>{series.name}</h3>
                    <div className="meta">
                      <span>
                        {sessions.length} tillfällen · {weekdayPlural(first, tz)} {formatTime(first, tz)}
                      </span>
                      <span>
                        {started ? 'Pågår' : 'Start'} {formatDay(first, tz)}
                        {sessions.length > 1 ? ` – ${formatDay(last, tz)}` : ''}
                      </span>
                    </div>
                    <div className="mt1">{spotsLabel(free)}</div>
                  </div>
                  <div className="price">{series.price_ore > 0 ? formatKr(series.price_ore) : 'Gratis'}</div>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {classes.length > 0 && (
        <section id="pass">
          <div className="section-title">
            <h2>Pass</h2>
            <span className="small faint">Drop-in, boka ett i taget</span>
          </div>
          {[...byDay.entries()].map(([day, list]) => (
            <div key={day} className="daygroup">
              <p className="dayname">{formatDay(new Date(list[0].session.starts_at), tz)}</p>
              {list.map(({ session, free }) => (
                <Link
                  key={session.id}
                  href={`/s/${slug}/pass/${session.id}`}
                  className={`timeitem${free <= 0 ? ' full' : ''}`}
                >
                  <span className="time">{formatTime(new Date(session.starts_at), tz)}</span>
                  <span>
                    <strong>{session.title}</strong>
                    <br />
                    <span className="small muted">
                      {Math.round((new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60000)} min ·{' '}
                      {free <= 0 ? 'Fullbokat – väntelista' : free === 1 ? '1 plats kvar' : `${free} platser kvar`}
                    </span>
                  </span>
                  <span className="price nowrap">{session.price_ore > 0 ? formatKr(session.price_ore) : 'Gratis'}</span>
                </Link>
              ))}
            </div>
          ))}
        </section>
      )}

      {services.length > 0 && (
        <section id="behandlingar">
          <div className="section-title">
            <h2>Behandlingar</h2>
          </div>
          <div className="stack">
            {services.map((s) => (
              <Link key={s.id} href={`/s/${slug}/behandling/${s.id}`} className="card link">
                <div className="offer">
                  <div className="grow">
                    <h3>{s.name}</h3>
                    {s.description && <p className="muted small mb0">{s.description}</p>}
                    <div className="meta">
                      <span>{s.duration_min} min</span>
                    </div>
                  </div>
                  <div className="price">{s.price_ore > 0 ? formatKr(s.price_ore) : 'Gratis'}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {settings.cancelHoursSingle > 0 && !empty && (
        <p className="small faint mt4">
          {capitalize(
            `kostnadsfri avbokning fram till ${settings.cancelHoursSingle} timmar före pass och behandlingar, och ${settings.cancelDaysCourse} dagar före kursstart.`,
          )}
        </p>
      )}
    </main>
  );
}
