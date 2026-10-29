'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  chooseStudio,
  consumeLoginToken,
  logout,
  requireEmail,
  requireStudio,
  requireSuperadmin,
  sendLoginLink,
} from '@/lib/auth';
import {
  BookingError,
  cancelBooking,
  cancelSeries,
  cancelSession,
  getBooking,
  issueCredit,
  messageParticipants,
  moveSession,
  sendConfirmation,
  startBooking,
} from '@/lib/booking';
import { audit, db, must } from '@/lib/db';
import { env, isSuperadmin } from '@/lib/env';
import { parseKr } from '@/lib/money';
import { DEFAULT_SETTINGS, getSettings } from '@/lib/settings';
import { connectOnboardingLink, refreshStripeStatus } from '@/lib/stripe';
import { runSetup } from '@/lib/system';
import { TemplateKey, TEMPLATES } from '@/lib/templates';
import { Service, Session } from '@/lib/types';
import { addDaysKey, zonedToUtc } from '@/lib/tz';

// ---------- Hjälp ----------

function go(path: string, msg?: { ok?: string; err?: string }): never {
  const u = new URL(path, 'http://x');
  if (msg?.ok) u.searchParams.set('ok', msg.ok);
  if (msg?.err) u.searchParams.set('err', msg.err);
  redirect(u.pathname + u.search);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const int = (f: FormData, k: string, d = 0) => {
  const n = parseInt(str(f, k), 10);
  return Number.isFinite(n) ? n : d;
};
const errMsg = (e: any) => (e instanceof BookingError ? e.message : e?.message ?? 'Något gick fel.');

// ---------- Inloggning ----------

export async function loginAction(f: FormData) {
  try {
    await sendLoginLink(str(f, 'email'));
  } catch (e) {
    console.error('Inloggningslänk', e);
  }
  go('/admin/logga-in', { ok: 'skickat' });
}

export async function verifyAction(f: FormData) {
  const email = await consumeLoginToken(str(f, 't'));
  if (!email) go('/admin/logga-in', { err: 'Länken har gått ut eller redan använts. Be om en ny.' });
  go('/admin');
}

export async function logoutAction() {
  await logout();
  go('/admin/logga-in');
}

export async function switchStudioAction(f: FormData) {
  const { studios } = await requireStudio();
  const id = str(f, 'studio');
  if (studios.some((s) => s.id === id)) await chooseStudio(id);
  go('/admin');
}

// ---------- Studio ----------

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/å|ä/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function createStudio(name: string, slugInput: string, ownerEmail: string, studioEmail: string) {
  const slug = slugify(slugInput || name);
  if (!name || slug.length < 2) throw new Error('Ange ett namn på studion.');
  const { data, error } = await db()
    .from('studios')
    .insert({ name, slug, email: studioEmail || ownerEmail, settings: DEFAULT_SETTINGS })
    .select('id')
    .single();
  if (error) {
    if ((error as any).code === '23505') throw new Error(`Adressen "${slug}" är upptagen. Välj en annan.`);
    throw new Error(error.message);
  }
  must(await db().from('studio_members').insert({ studio_id: data.id, email: ownerEmail.toLowerCase(), role: 'owner' }));
  // Färdiga mallar att utgå från.
  await db().from('services').insert([
    { studio_id: data.id, kind: 'class', name: 'Yoga', duration_min: 60, price_ore: 20000, vat_rate: 6, capacity: 12, sort: 1 },
    { studio_id: data.id, kind: 'course', name: 'Yogakurs', duration_min: 75, price_ore: 160000, vat_rate: 6, capacity: 12, sessions_count: 7, sort: 2 },
    { studio_id: data.id, kind: 'appointment', name: 'Behandling 60 min', duration_min: 60, price_ore: 75000, vat_rate: 25, capacity: 1, buffer_min: 15, active: false, sort: 3 },
  ]);
  await audit(data.id, ownerEmail, 'studio.created', { name, slug });
  return data.id as string;
}

export async function onboardingAction(f: FormData) {
  const email = await requireEmail();
  if (!env.allowSignup && !isSuperadmin(email)) go('/admin/kom-igang', { err: 'Konton skapas av administratören.' });
  let id = '';
  try {
    const owner = isSuperadmin(email) && str(f, 'owner').includes('@') ? str(f, 'owner').toLowerCase() : email;
    id = await createStudio(str(f, 'name'), str(f, 'slug'), owner, owner);
  } catch (e: any) {
    go('/admin/kom-igang', { err: errMsg(e) });
  }
  await chooseStudio(id);
  go('/admin', { ok: 'Välkommen! Din studio är skapad.' });
}

export async function superCreateStudioAction(f: FormData) {
  await requireSuperadmin();
  try {
    await createStudio(str(f, 'name'), str(f, 'slug'), str(f, 'owner').toLowerCase(), str(f, 'owner').toLowerCase());
  } catch (e: any) {
    go('/admin/system', { err: errMsg(e) });
  }
  go('/admin/system', { ok: 'Studion är skapad. Ägaren kan nu logga in med sin e-post.' });
}

export async function superUpdateStudioAction(f: FormData) {
  await requireSuperadmin();
  const id = str(f, 'id');
  const fee = Math.max(0, Math.min(50, Number(str(f, 'fee').replace(',', '.')) || 0));
  const domain = str(f, 'domain').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null;
  const { error } = await db().from('studios').update({ platform_fee_percent: fee, custom_domain: domain }).eq('id', id);
  if (error) go('/admin/system', { err: error.message });
  const member = str(f, 'member').toLowerCase();
  if (member) await db().from('studio_members').upsert({ studio_id: id, email: member, role: 'owner' });
  go('/admin/system', { ok: 'Sparat.' });
}

export async function superOpenStudioAction(f: FormData) {
  await requireSuperadmin();
  await chooseStudio(str(f, 'id'));
  go('/admin');
}

export async function runSetupAction() {
  await requireSuperadmin();
  let out: string[] = [];
  try {
    out = await runSetup();
  } catch (e: any) {
    go('/admin/system', { err: errMsg(e) });
  }
  go('/admin/system', { ok: out.join(' · ') });
}

// ---------- Inställningar ----------

export async function saveProfileAction(f: FormData) {
  const { studio, email } = await requireStudio();
  const color = str(f, 'accent_color');
  const update = {
    name: str(f, 'name') || studio.name,
    email: str(f, 'email') || null,
    phone: str(f, 'phone') || null,
    address: str(f, 'address') || null,
    org_nr: str(f, 'org_nr') || null,
    website: str(f, 'website') || null,
    description: str(f, 'description') || null,
    logo_url: str(f, 'logo_url') || null,
    accent_color: /^#[0-9a-f]{6}$/i.test(color) ? color : studio.accent_color,
  };
  const { error } = await db().from('studios').update(update).eq('id', studio.id);
  if (error) go('/admin/installningar', { err: error.message });
  await audit(studio.id, email, 'settings.profile');
  revalidatePath('/admin', 'layout');
  go('/admin/installningar', { ok: 'Uppgifterna är sparade.' });
}

async function patchSettings(studioId: string, current: unknown, patch: Record<string, unknown>) {
  const next = { ...getSettings(current), ...patch };
  must(await db().from('studios').update({ settings: next }).eq('id', studioId));
}

export async function saveHoursAction(f: FormData) {
  const { studio, email } = await requireStudio();
  const openingHours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    day,
    open: f.get(`open_${day}`) === 'on',
    start: /^\d{2}:\d{2}$/.test(str(f, `start_${day}`)) ? str(f, `start_${day}`) : '09:00',
    end: /^\d{2}:\d{2}$/.test(str(f, `end_${day}`)) ? str(f, `end_${day}`) : '17:00',
  }));
  if (openingHours.some((h) => h.open && h.end <= h.start)) {
    go('/admin/installningar', { err: 'Sluttiden måste vara efter starttiden.' });
  }
  await patchSettings(studio.id, studio.settings, {
    openingHours,
    slotStepMin: Math.max(5, int(f, 'slotStepMin', 30)),
  });
  await audit(studio.id, email, 'settings.hours');
  go('/admin/installningar', { ok: 'Öppettiderna är sparade.' });
}

export async function saveRulesAction(f: FormData) {
  const { studio, email } = await requireStudio();
  await patchSettings(studio.id, studio.settings, {
    bookingWindowDays: Math.max(1, int(f, 'bookingWindowDays', 90)),
    minNoticeHours: Math.max(0, int(f, 'minNoticeHours', 2)),
    cancelHoursSingle: Math.max(0, int(f, 'cancelHoursSingle', 24)),
    cancelDaysCourse: Math.max(0, int(f, 'cancelDaysCourse', 7)),
    refundMode: str(f, 'refundMode') === 'credit' ? 'credit' : 'money',
    waitlistEnabled: f.get('waitlistEnabled') === 'on',
    waitlistOfferHours: Math.max(1, int(f, 'waitlistOfferHours', 2)),
    reminderHours: Math.max(0, int(f, 'reminderHours', 24)),
    notifyStudio: f.get('notifyStudio') === 'on',
    allowVouchers: f.get('allowVouchers') === 'on',
    terms: str(f, 'terms') || DEFAULT_SETTINGS.terms,
    bookingNote: str(f, 'bookingNote'),
  });
  await audit(studio.id, email, 'settings.rules');
  go('/admin/installningar', { ok: 'Reglerna är sparade.' });
}

export async function saveTemplateAction(f: FormData) {
  const { studio, email } = await requireStudio();
  const key = str(f, 'key') as TemplateKey;
  if (!(key in TEMPLATES)) go('/admin/installningar');
  const subject = str(f, 'subject');
  const body = String(f.get('body') ?? '').trim();
  if (f.get('reset') === '1' || (!subject && !body)) {
    await db().from('email_templates').delete().eq('studio_id', studio.id).eq('key', key);
    go('/admin/installningar', { ok: 'Mailtexten är återställd.' });
  }
  must(
    await db().from('email_templates').upsert({
      studio_id: studio.id,
      key,
      subject: subject || TEMPLATES[key].subject,
      body: body || TEMPLATES[key].body,
      updated_at: new Date().toISOString(),
    }),
  );
  await audit(studio.id, email, 'settings.template', { key });
  go('/admin/installningar', { ok: 'Mailtexten är sparad.' });
}

export async function connectStripeAction() {
  const { studio } = await requireStudio();
  let url = '';
  try {
    url = await connectOnboardingLink(studio, '/admin/installningar');
  } catch (e: any) {
    go('/admin/installningar', { err: 'Stripe: ' + errMsg(e) });
  }
  redirect(url);
}

export async function refreshStripeAction() {
  const { studio } = await requireStudio();
  let ok = false;
  try {
    ok = await refreshStripeStatus(studio);
  } catch (e: any) {
    go('/admin/installningar', { err: 'Stripe: ' + errMsg(e) });
  }
  go('/admin/installningar', ok ? { ok: 'Stripe är kopplat. Du kan ta emot betalningar.' } : { err: 'Stripe är inte klart än. Slutför uppgifterna hos Stripe.' });
}

// ---------- Tjänster (mallar) ----------

export async function saveServiceAction(f: FormData) {
  const { studio, email } = await requireStudio();
  const id = str(f, 'id');
  const kind = str(f, 'kind') as Service['kind'];
  if (!['class', 'course', 'appointment'].includes(kind)) go('/admin/tjanster', { err: 'Välj typ.' });
  const row = {
    studio_id: studio.id,
    kind,
    name: str(f, 'name'),
    description: str(f, 'description') || null,
    duration_min: Math.max(5, int(f, 'duration_min', 60)),
    price_ore: parseKr(str(f, 'price')),
    vat_rate: Number(str(f, 'vat_rate') || 25),
    capacity: kind === 'appointment' ? 1 : Math.max(1, int(f, 'capacity', 10)),
    buffer_min: Math.max(0, int(f, 'buffer_min', 0)),
    sessions_count: Math.max(1, int(f, 'sessions_count', 7)),
    active: f.get('active') === 'on',
  };
  if (!row.name) go('/admin/tjanster', { err: 'Ange ett namn.' });
  const res = id
    ? await db().from('services').update(row).eq('id', id).eq('studio_id', studio.id)
    : await db().from('services').insert(row);
  if (res.error) go('/admin/tjanster', { err: res.error.message });
  await audit(studio.id, email, id ? 'service.updated' : 'service.created', { name: row.name });
  go('/admin/tjanster', { ok: id ? 'Mallen är sparad.' : 'Mallen är skapad.' });
}

// ---------- Pass ----------

export async function createSessionsAction(f: FormData) {
  const { studio, email } = await requireStudio();
  const type = str(f, 'type'); // class | block
  const date = str(f, 'date');
  const time = str(f, 'time');
  const repeat = Math.max(1, Math.min(52, int(f, 'repeat', 1)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) go('/admin/pass/ny', { err: 'Välj datum och tid.' });

  let title = str(f, 'title');
  let duration = Math.max(5, int(f, 'duration', 60));
  let capacity = 1;
  let price = 0;
  let vat = 25;
  let buffer = 0;
  let serviceId: string | null = null;

  if (type === 'class') {
    const { data: svc } = await db()
      .from('services')
      .select('*')
      .eq('id', str(f, 'service'))
      .eq('studio_id', studio.id)
      .maybeSingle();
    if (!svc) go('/admin/pass/ny', { err: 'Välj en mall.' });
    const s = svc as Service;
    serviceId = s.id;
    title = title || s.name;
    duration = int(f, 'duration', 0) || s.duration_min;
    capacity = int(f, 'capacity', 0) || s.capacity;
    price = str(f, 'price') ? parseKr(str(f, 'price')) : s.price_ore;
    vat = Number(s.vat_rate);
    buffer = s.buffer_min;
  } else {
    title = title || 'Blockerad tid';
  }

  const starts = Array.from({ length: repeat }, (_, i) => zonedToUtc(addDaysKey(date, i * 7), time, studio.timezone));
  const { data: conflicts } = await db().rpc('find_conflicts', {
    p_studio: studio.id,
    p_starts: starts.map((s) => s.toISOString()),
    p_minutes: duration + buffer,
  });
  const clash = new Set(((conflicts ?? []) as { starts_at: string }[]).map((c) => new Date(c.starts_at).getTime()));
  const rows = starts
    .filter((s) => !clash.has(s.getTime()))
    .map((s) => ({
      studio_id: studio.id,
      service_id: serviceId,
      kind: type === 'class' ? 'class' : 'block',
      title,
      starts_at: s.toISOString(),
      ends_at: new Date(s.getTime() + duration * 60_000).toISOString(),
      blocked_until: new Date(s.getTime() + (duration + buffer) * 60_000).toISOString(),
      capacity,
      price_ore: price,
      vat_rate: vat,
      note: str(f, 'note') || null,
    }));
  if (rows.length) {
    const { error } = await db().from('sessions').insert(rows);
    if (error) go('/admin/pass/ny', { err: error.message });
  }
  await audit(studio.id, email, 'sessions.created', { title, count: rows.length });
  const skipped = starts.length - rows.length;
  if (!rows.length) go('/admin/pass/ny', { err: 'Tiden krockar med något annat i kalendern.' });
  go(`/admin/kalender?v=${date}`, {
    ok:
      `${rows.length === 1 ? 'Passet är skapat' : `${rows.length} pass är skapade`}` +
      (skipped ? ` (${skipped} hoppades över eftersom de krockade).` : '.'),
  });
}

export async function createCourseAction(f: FormData) {
  const { studio, email } = await requireStudio();
  const { data: svc } = await db().from('services').select('*').eq('id', str(f, 'service')).eq('studio_id', studio.id).maybeSingle();
  if (!svc) go('/admin/kurs/ny', { err: 'Välj en kursmall.' });
  const s = svc as Service;
  const dates = f.getAll('dates').map(String).filter((d) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d));
  if (!dates.length) go('/admin/kurs/ny', { err: 'Välj minst ett datum.' });
  const starts = dates.map((d) => zonedToUtc(d.slice(0, 10), d.slice(11, 16), studio.timezone)).sort((a, b) => a.getTime() - b.getTime());
  const duration = Math.max(5, int(f, 'duration', s.duration_min));
  const { data: conflicts } = await db().rpc('find_conflicts', {
    p_studio: studio.id,
    p_starts: starts.map((x) => x.toISOString()),
    p_minutes: duration + s.buffer_min,
  });
  if (conflicts?.length) {
    const list = (conflicts as { starts_at: string; conflict_title: string }[])
      .map((c) => `${new Date(c.starts_at).toLocaleDateString('sv-SE', { timeZone: studio.timezone })} (${c.conflict_title})`)
      .join(', ');
    go('/admin/kurs/ny', { err: `Några datum krockar: ${list}. Ta bort dem eller ändra tid.` });
  }
  const { data: seriesId, error } = await db().rpc('create_course', {
    p_studio: studio.id,
    p_service: s.id,
    p_name: str(f, 'name') || s.name,
    p_description: str(f, 'description') || s.description,
    p_price_ore: str(f, 'price') ? parseKr(str(f, 'price')) : s.price_ore,
    p_vat: Number(s.vat_rate),
    p_capacity: int(f, 'capacity', 0) || s.capacity,
    p_duration_min: duration,
    p_buffer_min: s.buffer_min,
    p_starts: starts.map((x) => x.toISOString()),
    p_allow_late: f.get('allow_late') === 'on',
  });
  if (error) go('/admin/kurs/ny', { err: error.code === '23P01' ? 'Ett av datumen krockar med något annat.' : error.message });
  await audit(studio.id, email, 'course.created', { series: seriesId, sessions: starts.length });
  go(`/admin/kurs/${seriesId}`, { ok: `Kursen är skapad med ${starts.length} tillfällen och är bokningsbar nu.` });
}

async function ownSession(studioId: string, id: string): Promise<Session> {
  const { data } = await db().from('sessions').select('*').eq('id', id).eq('studio_id', studioId).maybeSingle();
  if (!data) go('/admin/kalender', { err: 'Passet finns inte.' });
  return data as Session;
}

export async function moveSessionAction(f: FormData) {
  const { studio } = await requireStudio();
  const s = await ownSession(studio.id, str(f, 'id'));
  const date = str(f, 'date');
  const time = str(f, 'time');
  let msg = '';
  try {
    msg = await moveSession(studio, s.id, zonedToUtc(date, time, studio.timezone), f.get('notify') === 'on');
  } catch (e: any) {
    go(`/admin/pass/${s.id}`, { err: errMsg(e) });
  }
  go(`/admin/pass/${s.id}`, { ok: msg });
}

export async function cancelSessionAction(f: FormData) {
  const { studio } = await requireStudio();
  const s = await ownSession(studio.id, str(f, 'id'));
  const refund = (['money', 'credit', 'none'].includes(str(f, 'refund')) ? str(f, 'refund') : 'money') as 'money' | 'credit' | 'none';
  let msg = '';
  try {
    msg = await cancelSession(studio, s.id, refund, str(f, 'message'));
  } catch (e: any) {
    go(`/admin/pass/${s.id}`, { err: errMsg(e) });
  }
  go(`/admin/pass/${s.id}`, { ok: msg });
}

export async function messageAction(f: FormData) {
  const { studio } = await requireStudio();
  const s = await ownSession(studio.id, str(f, 'id'));
  const back = str(f, 'back') || `/admin/pass/${s.id}`;
  const subject = str(f, 'subject') || `Meddelande från ${studio.name}`;
  const text = String(f.get('text') ?? '').trim();
  if (!text) go(back, { err: 'Skriv ett meddelande.' });
  const n = await messageParticipants(studio, s.id, subject, text);
  go(back, { ok: n ? `Meddelandet är skickat till ${n} deltagare.` : 'Det finns inga deltagare att skicka till.' });
}

export async function checkInAction(f: FormData) {
  const { studio } = await requireStudio();
  const s = await ownSession(studio.id, str(f, 'session'));
  const status = ['booked', 'checked_in', 'no_show'].includes(str(f, 'status')) ? str(f, 'status') : 'booked';
  await db().from('attendances').update({ status }).eq('session_id', s.id).eq('booking_id', str(f, 'booking'));
  revalidatePath(`/admin/pass/${s.id}`);
  go(`/admin/pass/${s.id}`);
}

export async function addParticipantAction(f: FormData) {
  const { studio, email } = await requireStudio();
  const kind = str(f, 'kind') as 'class' | 'course';
  const back = str(f, 'back');
  try {
    await startBooking({
      studio,
      kind,
      sessionId: kind === 'class' ? str(f, 'session') : null,
      seriesId: kind === 'course' ? str(f, 'series') : null,
      name: str(f, 'name'),
      email: str(f, 'email'),
      phone: str(f, 'phone'),
      source: 'manual',
      manualPayment: str(f, 'payment') === 'free' ? 'free' : 'onsite',
    });
  } catch (e: any) {
    go(back, { err: errMsg(e) });
  }
  await audit(studio.id, email, 'booking.manual', { kind });
  go(back, { ok: 'Deltagaren är inbokad och har fått en bekräftelse.' });
}

export async function cancelSeriesAction(f: FormData) {
  const { studio } = await requireStudio();
  const id = str(f, 'id');
  const refund = (['money', 'credit', 'none'].includes(str(f, 'refund')) ? str(f, 'refund') : 'money') as 'money' | 'credit' | 'none';
  let msg = '';
  try {
    msg = await cancelSeries(studio, id, refund, str(f, 'message'));
  } catch (e: any) {
    go(`/admin/kurs/${id}`, { err: errMsg(e) });
  }
  go(`/admin/kurs/${id}`, { ok: msg });
}

export async function updateSeriesAction(f: FormData) {
  const { studio } = await requireStudio();
  const id = str(f, 'id');
  const { error } = await db()
    .from('series')
    .update({
      name: str(f, 'name'),
      description: str(f, 'description') || null,
      capacity: Math.max(1, int(f, 'capacity', 1)),
      allow_late_join: f.get('allow_late') === 'on',
    })
    .eq('id', id)
    .eq('studio_id', studio.id);
  if (!error) {
    await db().from('sessions').update({ title: str(f, 'name'), capacity: Math.max(1, int(f, 'capacity', 1)) }).eq('series_id', id);
  }
  go(`/admin/kurs/${id}`, error ? { err: error.message } : { ok: 'Kursen är uppdaterad.' });
}

export async function updateSessionAction(f: FormData) {
  const { studio } = await requireStudio();
  const s = await ownSession(studio.id, str(f, 'id'));
  const { error } = await db()
    .from('sessions')
    .update({
      title: str(f, 'title') || s.title,
      capacity: Math.max(1, int(f, 'capacity', s.capacity)),
      price_ore: str(f, 'price') ? parseKr(str(f, 'price')) : s.price_ore,
      note: str(f, 'note') || null,
    })
    .eq('id', s.id);
  go(`/admin/pass/${s.id}`, error ? { err: error.message } : { ok: 'Passet är uppdaterat.' });
}

// ---------- Bokningar ----------

export async function adminCancelBookingAction(f: FormData) {
  const { studio } = await requireStudio();
  const b = await getBooking(str(f, 'id'));
  if (!b || b.studio_id !== studio.id) go('/admin/bokningar', { err: 'Bokningen finns inte.' });
  const refund = (['money', 'credit', 'none'].includes(str(f, 'refund')) ? str(f, 'refund') : 'money') as 'money' | 'credit' | 'none';
  const amount = str(f, 'amount') ? parseKr(str(f, 'amount')) : undefined;
  let msg = '';
  try {
    msg = await cancelBooking(b!, studio, {
      by: 'studio',
      refund,
      amountOre: amount,
      message: str(f, 'message') || undefined,
      silent: f.get('notify') !== 'on',
    });
  } catch (e: any) {
    go(`/admin/bokningar/${b!.id}`, { err: errMsg(e) });
  }
  go(`/admin/bokningar/${b!.id}`, { ok: msg });
}

export async function resendConfirmationAction(f: FormData) {
  const { studio } = await requireStudio();
  const b = await getBooking(str(f, 'id'));
  if (!b || b.studio_id !== studio.id || b.status !== 'confirmed') go('/admin/bokningar');
  await db().from('outbox').update({ dedupe_key: null }).eq('dedupe_key', `confirm-${b!.id}`);
  await sendConfirmation(b!, studio);
  go(`/admin/bokningar/${b!.id}`, { ok: 'Bekräftelsen är skickad igen.' });
}

export async function createVoucherAction(f: FormData) {
  const { studio, email } = await requireStudio();
  const amount = parseKr(str(f, 'amount'));
  const to = str(f, 'email');
  if (amount <= 0 || !to.includes('@')) go('/admin/bokningar', { err: 'Ange belopp och e-post.' });
  const code = await issueCredit(studio, to, str(f, 'name') || null, amount, str(f, 'note') || 'Skapad av studion', str(f, 'kind') === 'gift' ? 'gift' : 'credit');
  await audit(studio.id, email, 'voucher.created', { to, amount });
  go('/admin/bokningar', { ok: `Koden ${code} är skapad och skickad till ${to}.` });
}
