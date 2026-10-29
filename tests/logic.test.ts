import { zonedToUtc, toDateKey, toTimeKey, formatDateTime, weekdayOfKey, mondayOfKey, addDaysKey, weekdayPlural } from '../src/lib/tz';
import { computeSlots } from '../src/lib/availability';
import { getSettings } from '../src/lib/settings';
import { decideCancellation } from '../src/lib/policy';
import { buildIcs } from '../src/lib/ics';
import { formatKr, parseKr, vatIncluded } from '../src/lib/money';
import { renderEmail, renderVars } from '../src/lib/templates';

let fails = 0;
const eq = (name: string, a: any, b: any) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fails++;
  console.log(ok ? 'OK  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
};
const tz = 'Europe/Stockholm';
// Vintertid (UTC+1) och sommartid (UTC+2)
eq('vinter', zonedToUtc('2026-11-04', '18:00', tz).toISOString(), '2026-11-04T17:00:00.000Z');
eq('sommar', zonedToUtc('2026-07-01', '18:00', tz).toISOString(), '2026-07-01T16:00:00.000Z');
eq('dst-dag', zonedToUtc('2026-10-25', '10:00', tz).toISOString(), '2026-10-25T09:00:00.000Z');
eq('vår-dst', zonedToUtc('2026-03-29', '10:00', tz).toISOString(), '2026-03-29T08:00:00.000Z');
const d = new Date('2026-11-04T17:00:00Z');
eq('datekey', toDateKey(d, tz), '2026-11-04');
eq('timekey', toTimeKey(d, tz), '18:00');
console.log('     ', formatDateTime(d, tz), '|', weekdayPlural(d, tz));
eq('weekday ons', weekdayOfKey('2026-11-04'), 3);
eq('monday', mondayOfKey('2026-11-08'), '2026-11-02');
eq('adddays', addDaysKey('2026-12-30', 3), '2027-01-02');

const settings = getSettings({ openingHours: [{ day: 3, open: true, start: '09:00', end: '12:00' }] });
eq('settings merge keeps 7 days', settings.openingHours.length, 7);
const now = new Date('2026-11-01T08:00:00Z');
const slots = computeSlots({
  dateKey: '2026-11-04', tz, openingHours: settings.openingHours,
  busy: [{ start: zonedToUtc('2026-11-04', '10:30', tz), end: zonedToUtc('2026-11-04', '11:00', tz) }],
  durationMin: 60, bufferMin: 15, stepMin: 30, minNoticeHours: 2, windowDays: 90, now,
});
eq('slots', slots.map((s) => toTimeKey(s, tz)), ['09:00', '11:00']);
eq('stängd dag', computeSlots({ dateKey: '2026-11-08', tz, openingHours: settings.openingHours, busy: [], durationMin: 60, bufferMin: 0, stepMin: 30, minNoticeHours: 0, windowDays: 90, now }).length, 0);

const s2 = getSettings({});
const start = new Date('2026-11-10T17:00:00Z');
eq('kurs i tid', decideCancellation({ kind: 'course', status: 'confirmed', firstStart: start, settings: s2, now: new Date('2026-11-01T00:00:00Z') }).refund, 'money');
eq('kurs sent', decideCancellation({ kind: 'course', status: 'confirmed', firstStart: start, settings: s2, now: new Date('2026-11-05T00:00:00Z') }).refund, 'none');
eq('kurs startad', decideCancellation({ kind: 'course', status: 'confirmed', firstStart: start, settings: s2, now: new Date('2026-11-11T00:00:00Z') }).allowed, false);
eq('pass 25h', decideCancellation({ kind: 'class', status: 'confirmed', firstStart: start, settings: { ...s2, refundMode: 'credit' }, now: new Date('2026-11-09T15:00:00Z') }).refund, 'credit');

const ics = buildIcs([{ uid: 'a@x', start, end: new Date(start.getTime() + 3600e3), title: 'Yin, yoga; test', location: 'Storgatan 1' }], 'Studio');
eq('ics', ics.includes('DTSTART:20261110T170000Z') && ics.includes(String.raw`SUMMARY:Yin\, yoga\; test`), true);

eq('kr', formatKr(180000).replace(/\s/g, ' '), '1 800 kr');
eq('kr öre', formatKr(12345).replace(/\s/g, ' '), '123,45 kr');
eq('parse', parseKr('1 800,50'), 180050);
eq('moms 6', vatIncluded(10600, 6), 600);
eq('vars', renderVars('Hej {{fornamn}} på {{ studio }}!{{okand}}', { fornamn: 'Anna', studio: 'X' }), 'Hej Anna på X!');
const mail = renderEmail({ studioName: 'S', accent: '#123456', bodyText: 'Hej <b>', blocks: [{ type: 'button', label: 'Gå', url: 'https://x' }], footer: 'f' });
eq('escape', mail.html.includes('Hej &lt;b&gt;'), true);
console.log(fails ? `\n${fails} FAIL` : '\nALLA TESTER OK');
process.exit(fails ? 1 : 0);
