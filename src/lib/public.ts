// Data till den publika bokningssidan.
import { db, must } from './db';
import { Series, Service, Session, Studio } from './types';

export type CourseOffer = {
  series: Series;
  sessions: Session[];
  free: number;
  started: boolean;
};

export type ClassOffer = { session: Session; free: number };

export async function takenForSessions(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const { data } = await db().rpc('session_taken', { p_ids: ids });
  for (const r of (data ?? []) as { session_id: string; taken: number }[]) map.set(r.session_id, r.taken);
  return map;
}

export async function takenForSeries(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const { data } = await db().rpc('series_taken', { p_ids: ids });
  for (const r of (data ?? []) as { series_id: string; taken: number }[]) map.set(r.series_id, r.taken);
  return map;
}

export async function getCourses(studio: Studio): Promise<CourseOffer[]> {
  const series = must(
    await db().from('series').select('*').eq('studio_id', studio.id).eq('status', 'active').order('created_at'),
  ) as Series[];
  if (!series.length) return [];
  const sessions = must(
    await db()
      .from('sessions')
      .select('*')
      .in('series_id', series.map((s) => s.id))
      .eq('status', 'scheduled')
      .order('starts_at'),
  ) as Session[];
  const taken = await takenForSeries(series.map((s) => s.id));
  const now = Date.now();
  const out: CourseOffer[] = [];
  for (const s of series) {
    const ss = sessions.filter((x) => x.series_id === s.id);
    if (!ss.length) continue;
    const started = new Date(ss[0].starts_at).getTime() <= now;
    const hasFuture = ss.some((x) => new Date(x.starts_at).getTime() > now);
    if (!hasFuture) continue;
    if (started && !s.allow_late_join) continue;
    out.push({ series: s, sessions: ss, free: s.capacity - (taken.get(s.id) ?? 0), started });
  }
  return out.sort((a, b) => a.sessions[0].starts_at.localeCompare(b.sessions[0].starts_at));
}

export async function getClasses(studio: Studio, days = 28): Promise<ClassOffer[]> {
  const sessions = must(
    await db()
      .from('sessions')
      .select('*')
      .eq('studio_id', studio.id)
      .eq('kind', 'class')
      .eq('status', 'scheduled')
      .gt('starts_at', new Date().toISOString())
      .lt('starts_at', new Date(Date.now() + days * 86400_000).toISOString())
      .order('starts_at'),
  ) as Session[];
  const taken = await takenForSessions(sessions.map((s) => s.id));
  return sessions.map((s) => ({ session: s, free: s.capacity - (taken.get(s.id) ?? 0) }));
}

export async function getAppointmentServices(studio: Studio): Promise<Service[]> {
  return must(
    await db()
      .from('services')
      .select('*')
      .eq('studio_id', studio.id)
      .eq('kind', 'appointment')
      .eq('active', true)
      .order('sort')
      .order('name'),
  ) as Service[];
}
