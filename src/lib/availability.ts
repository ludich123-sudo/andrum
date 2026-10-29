// Beräknar lediga behandlingstider för en dag. Ren logik – testbar utan databas.
import { OpeningHour } from './settings';
import { minutesOfTimeKey, weekdayOfKey, zonedToUtc } from './tz';

export type Busy = { start: Date; end: Date };

export type SlotInput = {
  dateKey: string;
  tz: string;
  openingHours: OpeningHour[];
  busy: Busy[];
  durationMin: number;
  bufferMin: number;
  stepMin: number;
  minNoticeHours: number;
  windowDays: number;
  now: Date;
};

export function computeSlots(input: SlotInput): Date[] {
  const { dateKey, tz, durationMin, bufferMin, now } = input;
  const day = input.openingHours.find((h) => h.day === weekdayOfKey(dateKey));
  if (!day || !day.open) return [];

  const openMin = minutesOfTimeKey(day.start);
  const closeMin = minutesOfTimeKey(day.end);
  const step = Math.max(5, input.stepMin || 30);
  const earliest = now.getTime() + input.minNoticeHours * 3600_000;
  const latest = now.getTime() + input.windowDays * 86400_000;

  const slots: Date[] = [];
  for (let m = openMin; m + durationMin <= closeMin; m += step) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const start = zonedToUtc(dateKey, `${hh}:${mm}`, tz);
    const t = start.getTime();
    if (t < earliest || t > latest) continue;
    const blockedEnd = t + (durationMin + bufferMin) * 60_000;
    const clash = input.busy.some((b) => b.start.getTime() < blockedEnd && b.end.getTime() > t);
    if (!clash) slots.push(start);
  }
  return slots;
}
