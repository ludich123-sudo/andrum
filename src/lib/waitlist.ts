// Väntelista: när en plats blir ledig får nästa i kön ett tidsbegränsat erbjudande.
import { db, must } from './db';
import { queueTemplated } from './email';
import { getSettings } from './settings';
import { bookingBaseUrl, firstName, getStudioById } from './studio';
import { Series, Session, Studio, Waitlist } from './types';
import { formatDateTime } from './tz';

export async function joinWaitlist(opts: {
  studio: Studio;
  sessionId?: string | null;
  seriesId?: string | null;
  email: string;
  name: string;
  phone?: string;
}): Promise<string> {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ange en giltig e-postadress.');
  const settings = getSettings(opts.studio.settings);
  if (!settings.waitlistEnabled) throw new Error('Väntelistan är inte aktiverad.');

  let q = db().from('waitlist').select('id').eq('email', email).in('status', ['waiting', 'offered']);
  q = opts.sessionId ? q.eq('session_id', opts.sessionId) : q.eq('series_id', opts.seriesId!);
  const { data: existing } = await q.maybeSingle();
  if (existing) return 'Du står redan på väntelistan.';

  const target = await loadTarget(opts.sessionId ?? null, opts.seriesId ?? null);
  if (!target || target.studioId !== opts.studio.id) throw new Error('Hittar inte passet.');

  must(
    await db().from('waitlist').insert({
      studio_id: opts.studio.id,
      session_id: opts.sessionId || null,
      series_id: opts.seriesId || null,
      email,
      name: opts.name.trim() || null,
      phone: opts.phone?.trim() || null,
    }),
  );
  await queueTemplated({
    studio: opts.studio,
    to: email,
    key: 'waitlist_joined',
    vars: { fornamn: firstName(opts.name) || 'där', namn: opts.name, tjanst: target.title, datum: target.when },
    blocks: [{ type: 'details', rows: [['Vad', target.title], ['När', target.when]] }],
  });
  // Om det redan finns en ledig plats (t.ex. efter en avbokning) – erbjud direkt.
  await processWaitlistFor({ sessionId: opts.sessionId ?? undefined, seriesId: opts.seriesId ?? undefined });
  return 'Du står nu på väntelistan. Vi mejlar dig så fort en plats blir ledig.';
}

async function loadTarget(sessionId: string | null, seriesId: string | null) {
  if (sessionId) {
    const { data } = await db().from('sessions').select('*').eq('id', sessionId).maybeSingle();
    if (!data) return null;
    const s = data as Session;
    const studio = await getStudioById(s.studio_id);
    return {
      studioId: s.studio_id,
      title: s.title,
      start: new Date(s.starts_at),
      when: formatDateTime(new Date(s.starts_at), studio?.timezone ?? 'Europe/Stockholm'),
      active: s.status === 'scheduled',
      path: `pass/${s.id}`,
    };
  }
  const { data } = await db().from('series').select('*').eq('id', seriesId!).maybeSingle();
  if (!data) return null;
  const sr = data as Series;
  const { data: first } = await db()
    .from('sessions')
    .select('starts_at')
    .eq('series_id', sr.id)
    .eq('status', 'scheduled')
    .order('starts_at')
    .limit(1)
    .maybeSingle();
  const studio = await getStudioById(sr.studio_id);
  const start = first ? new Date(first.starts_at) : new Date(0);
  return {
    studioId: sr.studio_id,
    title: sr.name,
    start,
    when: first ? `Start ${formatDateTime(start, studio?.timezone ?? 'Europe/Stockholm')}` : '',
    active: sr.status === 'active',
    path: `kurs/${sr.id}`,
  };
}

/** Delar ut lediga platser till väntelistan för ett pass eller en kurs. */
export async function processWaitlistFor(target: { sessionId?: string; seriesId?: string }) {
  const sessionId = target.sessionId ?? null;
  const seriesId = target.seriesId ?? null;
  if (!sessionId && !seriesId) return;
  const t = await loadTarget(sessionId, seriesId);
  if (!t || !t.active) return;
  const studio = await getStudioById(t.studioId);
  if (!studio) return;
  const settings = getSettings(studio.settings);
  if (!settings.waitlistEnabled) return;

  const now = Date.now();
  const startsIn = t.start.getTime() - now;
  if (startsIn < 20 * 60_000) return; // för sent att erbjuda

  const { data: free } = await db().rpc('free_spots', { p_session: sessionId, p_series: seriesId, p_except_token: null });
  let spots = Number(free ?? 0);
  if (spots <= 0) return;

  let q = db().from('waitlist').select('*').eq('status', 'waiting').order('created_at');
  q = sessionId ? q.eq('session_id', sessionId) : q.eq('series_id', seriesId!);
  const { data: queue } = await q;
  const waiting = (queue ?? []) as Waitlist[];
  if (!waiting.length) return;

  const offerMs = settings.waitlistOfferHours * 3600_000;
  // Nära start: alla i kön får erbjudandet samtidigt, först till kvarn.
  const everyone = startsIn < offerMs * 1.5;
  const expires = new Date(Math.min(now + offerMs, t.start.getTime() - 15 * 60_000));
  const chosen = everyone ? waiting : waiting.slice(0, spots);

  for (const w of chosen) {
    const { data: claimed } = await db()
      .from('waitlist')
      .update({
        status: 'offered',
        offered_at: new Date().toISOString(),
        // Vid "alla samtidigt" hålls ingen plats (erbjudandet går ut vid start).
        offer_expires_at: everyone ? new Date(now).toISOString() : expires.toISOString(),
      })
      .eq('id', w.id)
      .eq('status', 'waiting')
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    const url = `${bookingBaseUrl(studio)}/${t.path}?vantelista=${w.token}`;
    await queueTemplated({
      studio,
      to: w.email,
      key: 'waitlist_offer',
      vars: { fornamn: firstName(w.name) || 'där', namn: w.name ?? '', tjanst: t.title, datum: t.when },
      blocks: [
        { type: 'details', rows: [['Vad', t.title], ['När', t.when]] },
        { type: 'button', label: 'Boka platsen', url },
        {
          type: 'note',
          text: everyone
            ? 'Erbjudandet har gått ut till alla på väntelistan – först att boka får platsen.'
            : `Platsen är reserverad åt dig till ${formatDateTime(expires, studio.timezone)}. Därefter går den vidare.`,
        },
      ],
      dedupeKey: `wl-offer-${w.id}`,
    });
    if (!everyone) spots--;
    if (spots <= 0 && !everyone) break;
  }
}

/** Cron: släpp utgångna erbjudanden och dela ut lediga platser. */
export async function processAllWaitlists() {
  const nowIso = new Date().toISOString();
  // Utgångna erbjudanden som inte bokats → expired.
  const { data: expired } = await db()
    .from('waitlist')
    .update({ status: 'expired' })
    .eq('status', 'offered')
    .lt('offer_expires_at', nowIso)
    .select('session_id, series_id');
  // Alla mål med folk i kö.
  const { data: waiting } = await db().from('waitlist').select('session_id, series_id').eq('status', 'waiting');
  const targets = new Map<string, { sessionId?: string; seriesId?: string }>();
  for (const r of [...(expired ?? []), ...(waiting ?? [])]) {
    if (r.session_id) targets.set('s' + r.session_id, { sessionId: r.session_id });
    if (r.series_id) targets.set('r' + r.series_id, { seriesId: r.series_id });
  }
  for (const t of targets.values()) {
    try {
      await processWaitlistFor(t);
    } catch {
      /* fortsätt med nästa */
    }
  }
  return targets.size;
}

export async function getOffer(token: string | null | undefined): Promise<Waitlist | null> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await db().from('waitlist').select('*').eq('token', token).maybeSingle();
  return (data as Waitlist) ?? null;
}
