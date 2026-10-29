// Kärnan: boka, bekräfta, avboka, återbetala, ställa in och flytta.
import { computeSlots } from './availability';
import { audit, db, must } from './db';
import { queueTemplated, toBase64 } from './email';
import { buildIcs, IcsEvent } from './ics';
import { formatKr, vatIncluded } from './money';
import { decideCancellation } from './policy';
import { getSettings } from './settings';
import { createCheckout, expireCheckout, refundPayment, retrieveCheckout } from './stripe';
import { bookingBaseUrl, firstName, getStudioById, manageUrl } from './studio';
import { EmailBlock } from './templates';
import { Booking, Customer, Series, Service, Session, Studio } from './types';
import { capitalize, formatDateTime, formatDay, formatTime, toDateKey, addDaysKey, zonedToUtc } from './tz';
import { processWaitlistFor } from './waitlist';

export class BookingError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const ERRORS: Record<string, string> = {
  FULL: 'Det är tyvärr fullbokat. Ställ dig gärna på väntelistan så hör vi av oss om en plats blir ledig.',
  ALREADY_BOOKED: 'Du har redan en bokning här. Kolla din e-post för bekräftelsen.',
  STARTED: 'Det här har redan börjat och går inte längre att boka.',
  NOT_FOUND: 'Det du försöker boka finns inte längre.',
  VOUCHER_INVALID: 'Koden är ogiltig, förbrukad eller har gått ut.',
};

function friendly(err: { message?: string; code?: string } | null): string {
  if (!err) return 'Något gick fel.';
  if (err.code === '23P01') return 'Tiden hann tyvärr bli bokad av någon annan. Välj en annan tid.';
  const key = Object.keys(ERRORS).find((k) => err.message?.includes(k));
  return key ? ERRORS[key] : 'Något gick fel. Försök igen om en stund.';
}

// ---------------------------------------------------------------------
// Läsa
// ---------------------------------------------------------------------

export async function getBusy(studioId: string, from: Date, to: Date) {
  const rows = must(
    await db()
      .from('sessions')
      .select('starts_at, blocked_until')
      .eq('studio_id', studioId)
      .eq('status', 'scheduled')
      .lt('starts_at', to.toISOString())
      .gt('blocked_until', from.toISOString()),
  ) as { starts_at: string; blocked_until: string }[];
  return rows.map((r) => ({ start: new Date(r.starts_at), end: new Date(r.blocked_until) }));
}

export async function slotsForDate(studio: Studio, service: Service, dateKey: string, now = new Date()) {
  const settings = getSettings(studio.settings);
  const dayStart = zonedToUtc(dateKey, '00:00', studio.timezone);
  const dayEnd = zonedToUtc(addDaysKey(dateKey, 1), '00:00', studio.timezone);
  const busy = await getBusy(studio.id, new Date(dayStart.getTime() - 6 * 3600_000), new Date(dayEnd.getTime() + 6 * 3600_000));
  return computeSlots({
    dateKey,
    tz: studio.timezone,
    openingHours: settings.openingHours,
    busy,
    durationMin: service.duration_min,
    bufferMin: service.buffer_min,
    stepMin: settings.slotStepMin,
    minNoticeHours: settings.minNoticeHours,
    windowDays: settings.bookingWindowDays,
    now,
  });
}

export async function getBookingByToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await db().from('bookings').select('*, customers(*)').eq('manage_token', token).maybeSingle();
  return (data as Booking) ?? null;
}

export async function getBooking(id: string) {
  const { data } = await db().from('bookings').select('*, customers(*)').eq('id', id).maybeSingle();
  return (data as Booking) ?? null;
}

/** Alla pass som hör till en bokning (alla kurstillfällen eller det enda passet). */
export async function bookingSessions(b: Booking): Promise<Session[]> {
  if (b.series_id) {
    const rows = must(
      await db().from('sessions').select('*').eq('series_id', b.series_id).order('starts_at'),
    ) as Session[];
    const att = must(await db().from('attendances').select('session_id').eq('booking_id', b.id)) as {
      session_id: string;
    }[];
    const ids = new Set(att.map((a) => a.session_id));
    return rows.filter((s) => ids.has(s.id) || s.status === 'scheduled');
  }
  const s = must(await db().from('sessions').select('*').eq('id', b.session_id).single()) as Session;
  return [s];
}

// ---------------------------------------------------------------------
// Boka
// ---------------------------------------------------------------------

export type StartBookingInput = {
  studio: Studio;
  kind: 'class' | 'course' | 'appointment';
  sessionId?: string | null;
  seriesId?: string | null;
  serviceId?: string | null;
  startsAt?: string | null;
  name: string;
  email: string;
  phone?: string;
  note?: string;
  voucherCode?: string;
  waitlistToken?: string | null;
  source?: 'online' | 'manual';
  manualPayment?: 'onsite' | 'free' | null;
};

export async function startBooking(input: StartBookingInput): Promise<{ url: string; bookingId: string }> {
  const { studio } = input;
  const email = (input.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingError('Ange en giltig e-postadress.');
  if (!input.name?.trim()) throw new BookingError('Ange ditt namn.');

  const isManual = input.source === 'manual';

  if (input.kind === 'appointment') {
    if (!input.serviceId || !input.startsAt) throw new BookingError('Välj en tid.');
    const service = must(
      await db().from('services').select('*').eq('id', input.serviceId).eq('studio_id', studio.id).single(),
    ) as Service;
    const start = new Date(input.startsAt);
    if (!isManual) {
      const dateKey = toDateKey(start, studio.timezone);
      const slots = await slotsForDate(studio, service, dateKey);
      if (!slots.some((s) => s.getTime() === start.getTime())) {
        throw new BookingError('Tiden är inte längre ledig. Välj en annan tid.');
      }
    }
  }

  const expires = new Date(Date.now() + 40 * 60_000).toISOString();
  const { data: bookingId, error } = await db().rpc('reserve_booking', {
    p_studio: studio.id,
    p_kind: input.kind,
    p_session: input.sessionId || null,
    p_series: input.seriesId || null,
    p_service: input.serviceId || null,
    p_starts: input.startsAt || null,
    p_email: email,
    p_name: input.name.trim(),
    p_phone: input.phone?.trim() || '',
    p_note: input.note?.trim() || null,
    p_answers: null,
    p_waitlist_token: input.waitlistToken || null,
    p_expires: expires,
    p_source: input.source ?? 'online',
  });
  if (error || !bookingId) throw new BookingError(friendly(error));

  if (input.voucherCode?.trim()) {
    const { error: vErr } = await db().rpc('apply_voucher', { p_booking: bookingId, p_code: input.voucherCode.trim() });
    if (vErr) {
      await db().rpc('release_booking', { p_booking: bookingId, p_status: 'expired', p_by: 'system' });
      throw new BookingError(friendly(vErr));
    }
  }

  const booking = (await getBooking(bookingId as string))!;
  const base = bookingBaseUrl(studio);

  // Manuell bokning från adminpanelen eller gratis/helt betalt med kod.
  if (isManual || booking.amount_ore <= 0) {
    await finalizeBooking(booking.id, {
      paidOre: 0,
      method: isManual ? (input.manualPayment === 'free' ? 'gratis' : 'på plats') : 'tillgodo/presentkort',
    });
    return { url: `${base}/tack?b=${booking.manage_token}`, bookingId: booking.id };
  }

  if (!studio.stripe_account_id || !studio.stripe_charges_enabled) {
    await db().rpc('release_booking', { p_booking: booking.id, p_status: 'expired', p_by: 'system' });
    throw new BookingError('Studion kan inte ta emot betalningar online just nu. Kontakta studion direkt.');
  }

  const sessions = await bookingSessions(booking);
  const desc =
    booking.kind === 'course'
      ? `${sessions.length} tillfällen, start ${formatDateTime(new Date(sessions[0].starts_at), studio.timezone)}`
      : formatDateTime(new Date(sessions[0].starts_at), studio.timezone);

  try {
    const checkout = await createCheckout({
      studio,
      bookingId: booking.id,
      amountOre: booking.amount_ore,
      title: booking.title,
      description: desc,
      email,
      successUrl: `${base}/tack?b=${booking.manage_token}`,
      cancelUrl: `${base}/avbruten?b=${booking.manage_token}`,
    });
    await db().from('bookings').update({ stripe_checkout_id: checkout.id }).eq('id', booking.id);
    return { url: checkout.url, bookingId: booking.id };
  } catch (e: any) {
    await db().rpc('release_booking', { p_booking: booking.id, p_status: 'expired', p_by: 'system' });
    throw new BookingError('Betalningen kunde inte startas: ' + (e?.message ?? 'okänt fel'));
  }
}

/** Bekräftar en bokning. Säker att anropa flera gånger. */
export async function finalizeBooking(
  bookingId: string,
  payment: { paidOre: number; method: string; paymentIntent?: string | null },
) {
  const { data: updated } = await db()
    .from('bookings')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      paid_ore: payment.paidOre,
      payment_method: payment.method,
      stripe_payment_intent: payment.paymentIntent ?? null,
      expires_at: null,
    })
    .eq('id', bookingId)
    .eq('status', 'pending')
    .select('*, customers(*)')
    .maybeSingle();

  if (!updated) {
    // Redan bekräftad = inget att göra. Utgången men betald = återbetala direkt.
    const existing = await getBooking(bookingId);
    if (existing && (existing.status === 'expired' || existing.status === 'cancelled') && payment.paidOre > 0 && payment.paymentIntent) {
      const studio = await getStudioById(existing.studio_id);
      if (studio) {
        await refundPayment(studio, payment.paymentIntent, payment.paidOre);
        await db()
          .from('bookings')
          .update({ paid_ore: payment.paidOre, refunded_ore: payment.paidOre, stripe_payment_intent: payment.paymentIntent })
          .eq('id', bookingId);
        await queueTemplated({
          studio,
          to: existing.customers!.email,
          key: 'late_payment_refunded',
          vars: varsFor(existing, studio, []),
          blocks: [{ type: 'details', rows: [['Återbetalat', formatKr(payment.paidOre)]] }],
          dedupeKey: `late-refund-${bookingId}`,
        });
      }
    }
    return;
  }

  const booking = updated as Booking;
  if (booking.waitlist_id) {
    await db().from('waitlist').update({ status: 'claimed' }).eq('id', booking.waitlist_id);
  }
  const studio = (await getStudioById(booking.studio_id))!;
  await audit(studio.id, booking.source === 'manual' ? 'studio' : booking.customers?.email ?? null, 'booking.confirmed', {
    booking: booking.id,
    title: booking.title,
    paid: payment.paidOre,
  });
  await sendConfirmation(booking, studio);
}

// ---------------------------------------------------------------------
// Mail för en bokning
// ---------------------------------------------------------------------

export function varsFor(b: Booking, studio: Studio, sessions: Session[]): Record<string, string> {
  const first = sessions[0] ? new Date(sessions[0].starts_at) : null;
  return {
    fornamn: firstName(b.customers?.name) || 'där',
    namn: b.customers?.name ?? '',
    studio: studio.name,
    tjanst: b.title,
    datum: first ? formatDateTime(first, studio.timezone) : '',
  };
}

export function icsFor(b: Booking, studio: Studio, sessions: Session[], cancelled = false): string {
  const events: IcsEvent[] = sessions
    .filter((s) => cancelled || s.status === 'scheduled')
    .map((s) => ({
      uid: `${b.id}-${s.id}@andrum`,
      start: new Date(s.starts_at),
      end: new Date(s.ends_at),
      title: `${b.title} – ${studio.name}`,
      location: studio.address,
      url: manageUrl(studio, b.manage_token),
      cancelled,
    }));
  return buildIcs(events, studio.name);
}

function whenRows(b: Booking, studio: Studio, sessions: Session[]): [string, string][] {
  const tz = studio.timezone;
  const active = sessions.filter((s) => s.status === 'scheduled');
  if (b.kind === 'course') {
    return [
      ['Kurs', b.title],
      [
        'Tillfällen',
        active
          .map((s) => `${capitalize(formatDay(new Date(s.starts_at), tz))} ${formatTime(new Date(s.starts_at), tz)}–${formatTime(new Date(s.ends_at), tz)}`)
          .join('\n'),
      ],
    ];
  }
  const s = sessions[0];
  return [
    ['Vad', b.title],
    ['När', `${capitalize(formatDay(new Date(s.starts_at), tz))} ${formatTime(new Date(s.starts_at), tz)}–${formatTime(new Date(s.ends_at), tz)}`],
  ];
}

export async function sendConfirmation(b: Booking, studio: Studio) {
  const sessions = await bookingSessions(b);
  const rows = whenRows(b, studio, sessions);
  if (studio.address) rows.push(['Plats', studio.address]);
  if (b.price_ore > 0) {
    rows.push(['Pris', formatKr(b.price_ore)]);
    if (b.voucher_ore > 0) rows.push(['Tillgodo/presentkort', `−${formatKr(b.voucher_ore)}`]);
    rows.push(['Betalt', `${formatKr(b.paid_ore)}${b.payment_method ? ` (${b.payment_method})` : ''}`]);
    if (b.paid_ore > 0) {
      rows.push(['Varav moms', `${formatKr(vatIncluded(b.paid_ore, Number(b.vat_rate)))} (${Number(b.vat_rate)} %)`]);
    }
  }
  const blocks: EmailBlock[] = [
    { type: 'details', rows },
    { type: 'button', label: 'Hantera eller avboka', url: manageUrl(studio, b.manage_token) },
  ];
  const settings = getSettings(studio.settings);
  if (settings.bookingNote) blocks.push({ type: 'note', text: settings.bookingNote });
  if (b.paid_ore > 0) {
    blocks.push({
      type: 'note',
      text: `Kvitto ${b.id.slice(0, 8).toUpperCase()} · ${studio.name}${studio.org_nr ? ` · Org.nr ${studio.org_nr}` : ''} · ${new Date(
        b.confirmed_at ?? Date.now(),
      ).toLocaleDateString('sv-SE')}`,
    });
  }

  await queueTemplated({
    studio,
    to: b.customers!.email,
    key: b.kind === 'course' ? 'course_confirmed' : 'booking_confirmed',
    vars: varsFor(b, studio, sessions),
    blocks,
    attachments: [{ filename: 'bokning.ics', content: toBase64(icsFor(b, studio, sessions)), contentType: 'text/calendar' }],
    dedupeKey: `confirm-${b.id}`,
  });

  if (settings.notifyStudio && studio.email) {
    await notifyStudio(studio, `Ny bokning: ${b.title}`, [
      ['Kund', `${b.customers?.name ?? ''} <${b.customers?.email}>`],
      ...(b.customers?.phone ? ([['Telefon', b.customers.phone]] as [string, string][]) : []),
      ...whenRows(b, studio, sessions).slice(-1),
      ['Betalt', formatKr(b.paid_ore)],
      ...(b.note ? ([['Meddelande', b.note]] as [string, string][]) : []),
    ]);
  }
}

export async function notifyStudio(studio: Studio, subject: string, rows: [string, string][]) {
  const { renderEmail } = await import('./templates');
  const { queueRaw, studioFooter } = await import('./email');
  if (!studio.email) return;
  const { html, text } = renderEmail({
    studioName: studio.name,
    accent: studio.accent_color,
    bodyText: subject,
    blocks: [{ type: 'details', rows }],
    footer: studioFooter(studio),
  });
  await queueRaw({ studioId: studio.id, fromName: studio.name, to: studio.email, subject, html, text });
}

// ---------------------------------------------------------------------
// Avboka, återbetala, tillgodo
// ---------------------------------------------------------------------

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function issueCredit(studio: Studio, email: string, name: string | null, amountOre: number, note: string, kind: 'credit' | 'gift' = 'credit') {
  if (amountOre <= 0) return null;
  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const { error } = await db().from('vouchers').insert({
      studio_id: studio.id,
      code,
      kind,
      initial_ore: amountOre,
      balance_ore: amountOre,
      customer_email: email.toLowerCase(),
      expires_at: new Date(Date.now() + 365 * 86400_000).toISOString(),
      note,
    });
    if (!error) break;
    code = randomCode();
  }
  await queueTemplated({
    studio,
    to: email,
    key: 'credit_issued',
    vars: { fornamn: firstName(name) || 'där', namn: name ?? '', tjanst: '', datum: '' },
    blocks: [
      { type: 'code', label: `Tillgodo ${formatKr(amountOre)} – giltig i 12 månader`, code },
      { type: 'button', label: 'Boka', url: bookingBaseUrl(studio) },
    ],
  });
  return code;
}

export type CancelOptions = {
  by: 'customer' | 'studio';
  refund: 'money' | 'credit' | 'none';
  amountOre?: number; // standard: allt som går att återbetala
  message?: string;
  silent?: boolean;
  templateKey?: 'booking_cancelled' | 'session_cancelled';
};

/** Avbokar en bokning och hanterar pengarna. Returnerar en text om vad som hände. */
export async function cancelBooking(b: Booking, studio: Studio, opts: CancelOptions): Promise<string> {
  const sessions = await bookingSessions(b);
  const released = await db().rpc('release_booking', { p_booking: b.id, p_status: 'cancelled', p_by: opts.by });
  if (released.error) throw new Error(released.error.message);
  if (b.status === 'pending' && b.stripe_checkout_id) await expireCheckout(studio, b.stripe_checkout_id);

  let outcome = 'Bokningen är avbokad.';
  const refundable = Math.max(0, b.paid_ore - b.refunded_ore);
  const totalValue = refundable + (b.status === 'confirmed' ? b.voucher_ore : 0);

  if (b.status === 'confirmed' && opts.refund === 'money') {
    const amount = Math.min(opts.amountOre ?? refundable, refundable);
    if (amount > 0 && b.stripe_payment_intent) {
      await refundPayment(studio, b.stripe_payment_intent, amount);
      await db().from('bookings').update({ refunded_ore: b.refunded_ore + amount }).eq('id', b.id);
      outcome = `Bokningen är avbokad och ${formatKr(amount)} återbetalas till samma betalsätt (oftast inom några minuter för Swish, några dagar för kort).`;
    }
    // Det som betalades med tillgodo/presentkort kommer tillbaka som tillgodo.
    if (b.voucher_ore > 0 && opts.amountOre === undefined) {
      const code = await issueCredit(studio, b.customers!.email, b.customers?.name ?? null, b.voucher_ore, `Återfört från bokning ${b.title}`);
      if (code) outcome += ` Det du betalade med kod (${formatKr(b.voucher_ore)}) får du tillbaka som tillgodo.`;
    }
  } else if (b.status === 'confirmed' && opts.refund === 'credit') {
    const amount = Math.min(opts.amountOre ?? totalValue, totalValue);
    if (amount > 0) {
      await issueCredit(studio, b.customers!.email, b.customers?.name ?? null, amount, `Avbokning: ${b.title}`);
      outcome = `Bokningen är avbokad och ${formatKr(amount)} har lagts som tillgodo. Koden skickas med e-post.`;
    }
  }

  await audit(studio.id, opts.by, 'booking.cancelled', { booking: b.id, refund: opts.refund, outcome });

  if (!opts.silent && b.status === 'confirmed') {
    const blocks: EmailBlock[] = [{ type: 'details', rows: whenRows(b, studio, sessions) }];
    if (opts.message) blocks.unshift({ type: 'note', text: opts.message });
    blocks.push({ type: 'note', text: outcome });
    await queueTemplated({
      studio,
      to: b.customers!.email,
      key: opts.templateKey ?? 'booking_cancelled',
      vars: varsFor(b, studio, sessions),
      blocks,
      attachments: [{ filename: 'avbokning.ics', content: toBase64(icsFor(b, studio, sessions, true)), contentType: 'text/calendar' }],
      dedupeKey: `cancel-${b.id}`,
    });
    if (opts.by === 'customer') {
      await notifyStudio(studio, `Avbokning: ${b.title}`, [
        ['Kund', `${b.customers?.name ?? ''} <${b.customers?.email}>`],
        ...whenRows(b, studio, sessions).slice(-1),
        ['Resultat', outcome],
      ]);
    }
  }

  // Ledig plats → väntelistan.
  if (b.kind === 'class' && b.session_id) await processWaitlistFor({ sessionId: b.session_id });
  if (b.kind === 'course' && b.series_id) await processWaitlistFor({ seriesId: b.series_id });
  return outcome;
}

/** Kundens egen avbokning enligt studions regler. */
export async function customerCancel(b: Booking, studio: Studio): Promise<string> {
  const sessions = await bookingSessions(b);
  const first = sessions.filter((s) => s.status === 'scheduled')[0] ?? sessions[0];
  const decision = decideCancellation({
    kind: b.kind,
    status: b.status,
    firstStart: new Date(first.starts_at),
    settings: getSettings(studio.settings),
    now: new Date(),
  });
  if (!decision.allowed) throw new BookingError(decision.reason);
  return cancelBooking(b, studio, { by: 'customer', refund: decision.refund });
}

// ---------------------------------------------------------------------
// Studion: ställa in, flytta, meddela
// ---------------------------------------------------------------------

async function confirmedBookingsForSession(session: Session): Promise<Booking[]> {
  if (session.series_id && session.kind === 'course') {
    return must(
      await db().from('bookings').select('*, customers(*)').eq('series_id', session.series_id).eq('status', 'confirmed'),
    ) as Booking[];
  }
  return must(
    await db().from('bookings').select('*, customers(*)').eq('session_id', session.id).eq('status', 'confirmed'),
  ) as Booking[];
}

export async function cancelSession(
  studio: Studio,
  sessionId: string,
  refund: 'money' | 'credit' | 'none',
  message: string,
): Promise<string> {
  const session = must(await db().from('sessions').select('*').eq('id', sessionId).eq('studio_id', studio.id).single()) as Session;
  const bookings = await confirmedBookingsForSession(session);
  must(await db().from('sessions').update({ status: 'cancelled' }).eq('id', session.id));
  await db().from('attendances').update({ status: 'cancelled' }).eq('session_id', session.id);
  await db().from('waitlist').update({ status: 'cancelled' }).eq('session_id', session.id).in('status', ['waiting', 'offered']);

  let count = 0;
  for (const b of bookings) {
    if (session.kind === 'course') {
      // Ett inställt kurstillfälle: meddela, pengar hanteras separat vid behov.
      const sessions = [session];
      const blocks: EmailBlock[] = [{ type: 'details', rows: whenRows({ ...b, kind: 'class' } as Booking, studio, sessions) }];
      if (message) blocks.unshift({ type: 'note', text: message });
      if (refund !== 'none') {
        const perSession = Math.floor(b.price_ore / Math.max(1, await countSeriesSessions(session.series_id!)));
        if (refund === 'credit' && perSession > 0) {
          await issueCredit(studio, b.customers!.email, b.customers?.name ?? null, perSession, `Inställt tillfälle: ${b.title}`);
          blocks.push({ type: 'note', text: `Du får ${formatKr(perSession)} som tillgodo för det inställda tillfället.` });
        } else if (refund === 'money' && perSession > 0 && b.stripe_payment_intent) {
          const amount = Math.min(perSession, b.paid_ore - b.refunded_ore);
          if (amount > 0) {
            await refundPayment(studio, b.stripe_payment_intent, amount);
            await db().from('bookings').update({ refunded_ore: b.refunded_ore + amount }).eq('id', b.id);
            blocks.push({ type: 'note', text: `${formatKr(amount)} återbetalas för det inställda tillfället.` });
          }
        }
      }
      await queueTemplated({
        studio,
        to: b.customers!.email,
        key: 'session_cancelled',
        vars: varsFor(b, studio, sessions),
        blocks,
        dedupeKey: `session-cancel-${session.id}-${b.id}`,
      });
    } else {
      await cancelBooking(b, studio, { by: 'studio', refund, message, templateKey: 'session_cancelled' });
    }
    count++;
  }
  await audit(studio.id, 'studio', 'session.cancelled', { session: session.id, title: session.title, bookings: count, refund });
  return count === 0 ? 'Passet är inställt.' : `Passet är inställt och ${count} ${count === 1 ? 'deltagare' : 'deltagare'} har meddelats.`;
}

async function countSeriesSessions(seriesId: string): Promise<number> {
  const { count } = await db().from('sessions').select('id', { count: 'exact', head: true }).eq('series_id', seriesId);
  return count ?? 1;
}

export async function cancelSeries(studio: Studio, seriesId: string, refund: 'money' | 'credit' | 'none', message: string) {
  const series = must(await db().from('series').select('*').eq('id', seriesId).eq('studio_id', studio.id).single()) as Series;
  const bookings = must(
    await db().from('bookings').select('*, customers(*)').eq('series_id', seriesId).in('status', ['confirmed', 'pending']),
  ) as Booking[];
  for (const b of bookings) {
    await cancelBooking(b, studio, { by: 'studio', refund, message, templateKey: 'session_cancelled' });
  }
  await db().from('series').update({ status: 'cancelled' }).eq('id', seriesId);
  await db().from('sessions').update({ status: 'cancelled' }).eq('series_id', seriesId);
  await db().from('waitlist').update({ status: 'cancelled' }).eq('series_id', seriesId).in('status', ['waiting', 'offered']);
  await audit(studio.id, 'studio', 'series.cancelled', { series: series.id, name: series.name, bookings: bookings.length });
  return `Kursen är inställd. ${bookings.length} deltagare har meddelats.`;
}

export async function moveSession(studio: Studio, sessionId: string, newStart: Date, notify: boolean): Promise<string> {
  const session = must(await db().from('sessions').select('*').eq('id', sessionId).eq('studio_id', studio.id).single()) as Session;
  const dur = new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime();
  const buf = new Date(session.blocked_until).getTime() - new Date(session.ends_at).getTime();
  const { error } = await db()
    .from('sessions')
    .update({
      starts_at: newStart.toISOString(),
      ends_at: new Date(newStart.getTime() + dur).toISOString(),
      blocked_until: new Date(newStart.getTime() + dur + buf).toISOString(),
    })
    .eq('id', session.id);
  if (error) {
    if ((error as any).code === '23P01') throw new BookingError('Den nya tiden krockar med något annat i kalendern.');
    throw new Error(error.message);
  }
  await db().from('attendances').update({ reminder_sent_at: null }).eq('session_id', session.id);
  if (!notify) return 'Passet är flyttat.';
  const moved = { ...session, starts_at: newStart.toISOString(), ends_at: new Date(newStart.getTime() + dur).toISOString() };
  const bookings = await confirmedBookingsForSession(session);
  for (const b of bookings) {
    const attending = must(
      await db().from('attendances').select('status').eq('booking_id', b.id).eq('session_id', session.id).maybeSingle(),
    ) as { status: string } | null;
    if (!attending || attending.status === 'cancelled') continue;
    await queueTemplated({
      studio,
      to: b.customers!.email,
      key: 'session_moved',
      vars: { ...varsFor(b, studio, [moved]), datum: formatDateTime(newStart, studio.timezone) },
      blocks: [
        { type: 'details', rows: whenRows({ ...b, kind: 'class' } as Booking, studio, [moved]) },
        { type: 'button', label: 'Hantera bokning', url: manageUrl(studio, b.manage_token) },
      ],
      attachments: [{ filename: 'ny-tid.ics', content: toBase64(icsFor(b, studio, [moved])), contentType: 'text/calendar' }],
    });
  }
  await audit(studio.id, 'studio', 'session.moved', { session: session.id, to: newStart.toISOString(), notified: bookings.length });
  return `Passet är flyttat och ${bookings.length} deltagare har fått den nya tiden.`;
}

export async function messageParticipants(studio: Studio, sessionId: string, subject: string, text: string) {
  const session = must(await db().from('sessions').select('*').eq('id', sessionId).eq('studio_id', studio.id).single()) as Session;
  const bookings = await confirmedBookingsForSession(session);
  const { renderEmail } = await import('./templates');
  const { queueRaw, studioFooter } = await import('./email');
  for (const b of bookings) {
    const { html, text: plain } = renderEmail({
      studioName: studio.name,
      accent: studio.accent_color,
      bodyText: `Hej ${firstName(b.customers?.name) || 'där'}!\n\n${text}`,
      blocks: [{ type: 'details', rows: whenRows({ ...b, kind: 'class' } as Booking, studio, [session]) }],
      footer: studioFooter(studio),
    });
    await queueRaw({
      studioId: studio.id,
      fromName: studio.name,
      replyTo: studio.email,
      to: b.customers!.email,
      subject,
      html,
      text: plain,
    });
  }
  await audit(studio.id, 'studio', 'session.message', { session: session.id, recipients: bookings.length, subject });
  return bookings.length;
}

/** Om webhooken dröjer: fråga Stripe direkt och bekräfta om betalningen är klar. */
export async function syncFromStripe(b: Booking, studio: Studio) {
  if (b.status !== 'pending' || !b.stripe_checkout_id) return;
  try {
    const cs: any = await retrieveCheckout(studio, b.stripe_checkout_id);
    if (cs.payment_status === 'paid') {
      await finalizeBooking(b.id, {
        paidOre: cs.amount_total ?? b.amount_ore,
        method: 'Stripe',
        paymentIntent: typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id,
      });
    }
  } catch {
    /* webhooken tar det */
  }
}

export { friendly as friendlyBookingError };
export type { Customer };
