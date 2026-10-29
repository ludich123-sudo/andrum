import { NextResponse } from 'next/server';
import { getStudioBySlug } from '@/lib/studio';
import { joinWaitlist } from '@/lib/waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig förfrågan.' }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ error: 'Spam.' }, { status: 400 });
  const studio = await getStudioBySlug(String(body.slug || ''));
  if (!studio) return NextResponse.json({ error: 'Studion finns inte.' }, { status: 404 });
  try {
    const message = await joinWaitlist({
      studio,
      sessionId: body.sessionId ?? null,
      seriesId: body.seriesId ?? null,
      email: String(body.email ?? ''),
      name: String(body.name ?? '').slice(0, 120),
      phone: String(body.phone ?? '').slice(0, 40),
    });
    return NextResponse.json({ message });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Något gick fel.' }, { status: 400 });
  }
}
