// Körs var 5:e minut av Supabase (pg_cron → /api/cron).
import { db, setConfig } from './db';
import { processOutbox, queueTemplated, toBase64 } from './email';
import { formatKr } from './money';
import { getSettings } from './settings';
import { getStudioById, manageUrl } from './studio';
import { Booking, Session, Studio } from './types';
import { capitalize, formatDay, formatTime } from './tz';
import { processAllWaitlists } from './waitlist';
import { buildIcs } from './ics';
import { firstName } from './studio';

export async function tick() {
  const result: Record<string, number> = {};

  // 1. Reservationer som aldrig betalades släpps.
  const { data: stale } = await db()
    .from('bookings')
    .select('id')
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .limit(200);
  for (const b of stale ?? []) {
    await db().rpc('release_booking', { p_booking: b.id, p_status: 'expired', p_by: 'system' });
  }
  result.expired = stale?.length ?? 0;

  // 2. Påminnelser.
  result.reminders = await sendReminders();

  // 3. Väntelistor.
  result.waitlists = await processAllWaitlists();

  // 4. Mailkö (nya försök).
  result.mails = await processOutbox();

  // 5. Städning.
  await db().from('login_tokens').delete().lt('expires_at', new Date(Date.now() - 86400_000).toISOString());

  await setConfig('cron_last_run', new Date().toISOString());
  return result;
}

async function sendReminders(): Promise<number> {
  const now = Date.now();
  const horizon = new Date(now + 72 * 3600_000).toISOString();
  const { data: sessions } = await db()
    .from('sessions')
    .select('*')
    .eq('status', 'scheduled')
    .neq('kind', 'block')
    .gt('starts_at', new Date(now).toISOString())
    .lte('starts_at', horizon);
  if (!sessions?.length) return 0;

  const studioCache = new Map<string, Studio | null>();
  let sent = 0;

  for (const s of sessions as Session[]) {
    if (!studioCache.has(s.studio_id)) studioCache.set(s.studio_id, await getStudioById(s.studio_id));
    const studio = studioCache.get(s.studio_id);
    if (!studio) continue;
    const settings = getSettings(studio.settings);
    const startMs = new Date(s.starts_at).getTime();
    if (!settings.reminderHours || startMs - now > settings.reminderHours * 3600_000) continue;

    const { data: rows } = await db()
      .from('attendances')
      .select('booking_id, session_id, bookings!inner(*, customers(*))')
      .eq('session_id', s.id)
      .eq('status', 'booked')
      .is('reminder_sent_at', null)
      .eq('bookings.status', 'confirmed');

    for (const r of (rows ?? []) as any[]) {
      const b = r.bookings as Booking;
      // Bokat inom påminnelsefönstret: bekräftelsen räcker.
      const bookedAt = new Date(b.confirmed_at ?? b.created_at).getTime();
      const skip = startMs - bookedAt < settings.reminderHours * 3600_000;
      if (!skip) {
        const tz = studio.timezone;
        const when = `${capitalize(formatDay(new Date(s.starts_at), tz))} ${formatTime(new Date(s.starts_at), tz)}–${formatTime(new Date(s.ends_at), tz)}`;
        const rowsDetails: [string, string][] = [
          ['Vad', s.title],
          ['När', when],
        ];
        if (studio.address) rowsDetails.push(['Plats', studio.address]);
        if (b.kind === 'appointment' && b.price_ore > 0 && b.paid_ore === 0) rowsDetails.push(['Att betala', formatKr(b.amount_ore)]);
        const ics = buildIcs(
          [{ uid: `${b.id}-${s.id}@andrum`, start: new Date(s.starts_at), end: new Date(s.ends_at), title: `${s.title} – ${studio.name}`, location: studio.address }],
          studio.name,
        );
        await queueTemplated({
          studio,
          to: b.customers!.email,
          key: 'reminder',
          vars: {
            fornamn: firstName(b.customers?.name) || 'där',
            namn: b.customers?.name ?? '',
            tjanst: s.title,
            datum: when.toLowerCase(),
          },
          blocks: [
            { type: 'details', rows: rowsDetails },
            { type: 'button', label: 'Hantera bokning', url: manageUrl(studio, b.manage_token) },
          ],
          attachments: [{ filename: 'pass.ics', content: toBase64(ics), contentType: 'text/calendar' }],
          dedupeKey: `reminder-${b.id}-${s.id}-${s.starts_at}`,
        });
        sent++;
      }
      await db()
        .from('attendances')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('booking_id', r.booking_id)
        .eq('session_id', r.session_id);
    }
  }
  return sent;
}
