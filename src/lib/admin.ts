// Läsfrågor för adminpanelen.
import { db, must } from './db';
import { Booking, Session, Studio, Waitlist } from './types';

export async function sessionsBetween(studio: Studio, from: Date, to: Date): Promise<Session[]> {
  return must(
    await db()
      .from('sessions')
      .select('*')
      .eq('studio_id', studio.id)
      .eq('status', 'scheduled')
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at'),
  ) as Session[];
}

export type Participant = {
  booking: Booking;
  attendance: { status: string };
};

export async function participants(session: Session): Promise<Participant[]> {
  const rows = must(
    await db()
      .from('attendances')
      .select('status, booking_id, bookings!inner(*, customers(*))')
      .eq('session_id', session.id)
      .neq('status', 'cancelled')
      .eq('bookings.status', 'confirmed'),
  ) as any[];
  return rows
    .map((r) => ({ booking: r.bookings as Booking, attendance: { status: r.status } }))
    .sort((a, b) => (a.booking.customers?.name ?? '').localeCompare(b.booking.customers?.name ?? '', 'sv'));
}

export async function seriesParticipants(seriesId: string): Promise<Booking[]> {
  return must(
    await db()
      .from('bookings')
      .select('*, customers(*)')
      .eq('series_id', seriesId)
      .eq('status', 'confirmed')
      .order('created_at'),
  ) as Booking[];
}

export async function waitlistFor(opts: { sessionId?: string; seriesId?: string }): Promise<Waitlist[]> {
  let q = db().from('waitlist').select('*').in('status', ['waiting', 'offered']).order('created_at');
  q = opts.sessionId ? q.eq('session_id', opts.sessionId) : q.eq('series_id', opts.seriesId!);
  return (must(await q) as Waitlist[]) ?? [];
}

export async function takenMap(sessionIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!sessionIds.length) return map;
  const { data } = await db().rpc('session_taken', { p_ids: sessionIds });
  for (const r of (data ?? []) as { session_id: string; taken: number }[]) map.set(r.session_id, r.taken);
  return map;
}

export async function recentBookings(studio: Studio, limit = 20): Promise<Booking[]> {
  return must(
    await db()
      .from('bookings')
      .select('*, customers(*)')
      .eq('studio_id', studio.id)
      .in('status', ['confirmed', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as Booking[];
}

export async function revenueSince(studio: Studio, since: Date): Promise<{ count: number; paid: number; refunded: number }> {
  const rows = must(
    await db()
      .from('bookings')
      .select('paid_ore, refunded_ore')
      .eq('studio_id', studio.id)
      .gte('confirmed_at', since.toISOString())
      .not('confirmed_at', 'is', null),
  ) as { paid_ore: number; refunded_ore: number }[];
  return {
    count: rows.length,
    paid: rows.reduce((a, r) => a + r.paid_ore, 0),
    refunded: rows.reduce((a, r) => a + r.refunded_ore, 0),
  };
}

export const ATT_LABEL: Record<string, string> = {
  booked: 'Bokad',
  checked_in: 'Närvarande',
  no_show: 'Kom inte',
  cancelled: 'Avbokad',
};

export const BOOKING_STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Bokad', cls: 'ok' },
  pending: { label: 'Väntar på betalning', cls: 'warn' },
  cancelled: { label: 'Avbokad', cls: 'danger' },
  expired: { label: 'Ej genomförd', cls: '' },
};
