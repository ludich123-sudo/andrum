import { bookingSessions, getBookingByToken, icsFor } from '@/lib/booking';
import { getStudioById } from '@/lib/studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const booking = await getBookingByToken(token);
  if (!booking) return new Response('Hittades inte', { status: 404 });
  const studio = await getStudioById(booking.studio_id);
  if (!studio) return new Response('Hittades inte', { status: 404 });
  const sessions = await bookingSessions(booking);
  const ics = icsFor(booking, studio, sessions, booking.status === 'cancelled');
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bokning.ics"',
    },
  });
}
