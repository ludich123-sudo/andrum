// Avbokningsregler. Ren logik – testbar utan databas.
import { StudioSettings } from './settings';

export type CancelDecision = {
  allowed: boolean;
  refund: 'money' | 'credit' | 'none';
  reason: string;
};

export function decideCancellation(opts: {
  kind: 'class' | 'course' | 'appointment';
  status: string;
  firstStart: Date;
  settings: StudioSettings;
  now: Date;
}): CancelDecision {
  const { kind, status, firstStart, settings, now } = opts;
  if (status !== 'confirmed') {
    return { allowed: false, refund: 'none', reason: 'Bokningen är redan avbokad eller inte genomförd.' };
  }
  const t = firstStart.getTime();
  const n = now.getTime();

  if (n >= t) {
    return {
      allowed: false,
      refund: 'none',
      reason:
        kind === 'course'
          ? 'Kursen har redan startat och kan inte längre avbokas.'
          : 'Passet har redan börjat och kan inte längre avbokas.',
    };
  }

  const limitMs =
    kind === 'course'
      ? settings.cancelDaysCourse * 86400_000
      : settings.cancelHoursSingle * 3600_000;
  const limitText =
    kind === 'course'
      ? `${settings.cancelDaysCourse} dagar före kursstart`
      : `${settings.cancelHoursSingle} timmar före start`;

  if (t - n >= limitMs) {
    return {
      allowed: true,
      refund: settings.refundMode,
      reason:
        settings.refundMode === 'money'
          ? `Du avbokar i tid (senast ${limitText}) och får pengarna tillbaka.`
          : `Du avbokar i tid (senast ${limitText}) och får hela beloppet som tillgodo.`,
    };
  }
  return {
    allowed: true,
    refund: 'none',
    reason: `Gränsen för kostnadsfri avbokning (${limitText}) har passerat. Du kan avboka så att någon annan får platsen, men beloppet återbetalas inte.`,
  };
}
