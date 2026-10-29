// Studions inställningar. Allt har ett standardvärde så att en ny studio
// kan gå live utan att röra något.

export type OpeningHour = { day: number; open: boolean; start: string; end: string };

export type StudioSettings = {
  bookingWindowDays: number;
  minNoticeHours: number;
  slotStepMin: number;
  cancelHoursSingle: number;
  cancelDaysCourse: number;
  refundMode: 'money' | 'credit';
  waitlistEnabled: boolean;
  waitlistOfferHours: number;
  reminderHours: number;
  notifyStudio: boolean;
  openingHours: OpeningHour[];
  terms: string;
  bookingNote: string;
  allowVouchers: boolean;
};

export const DAY_NAMES = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

export const DEFAULT_SETTINGS: StudioSettings = {
  bookingWindowDays: 90,
  minNoticeHours: 2,
  slotStepMin: 30,
  cancelHoursSingle: 24,
  cancelDaysCourse: 7,
  refundMode: 'money',
  waitlistEnabled: true,
  waitlistOfferHours: 2,
  reminderHours: 24,
  notifyStudio: true,
  openingHours: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    day,
    open: day <= 5,
    start: '09:00',
    end: '17:00',
  })),
  terms:
    'Genom att boka godkänner du att vi sparar dina kontaktuppgifter för att hantera din bokning. ' +
    'Avbokning sker via länken i din bekräftelse.',
  bookingNote: '',
  allowVouchers: true,
};

export function getSettings(raw: unknown): StudioSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<StudioSettings>;
  const merged = { ...DEFAULT_SETTINGS, ...s };
  const hours = Array.isArray(s.openingHours) ? s.openingHours : DEFAULT_SETTINGS.openingHours;
  merged.openingHours = DEFAULT_SETTINGS.openingHours.map(
    (d) => hours.find((h) => h && h.day === d.day) ?? d,
  );
  return merged;
}
