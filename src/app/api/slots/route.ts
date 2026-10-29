import { NextResponse } from 'next/server';
import { slotsForDate } from '@/lib/booking';
import { db } from '@/lib/db';
import { getStudioBySlug } from '@/lib/studio';
import { Service } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get('studio') ?? '';
  const serviceId = u.searchParams.get('service') ?? '';
  const date = u.searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ slots: [] });
  const studio = await getStudioBySlug(slug);
  if (!studio) return NextResponse.json({ slots: [] }, { status: 404 });
  const { data } = await db()
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .eq('studio_id', studio.id)
    .eq('kind', 'appointment')
    .eq('active', true)
    .maybeSingle();
  if (!data) return NextResponse.json({ slots: [] }, { status: 404 });
  const slots = await slotsForDate(studio, data as Service, date);
  return NextResponse.json({ slots: slots.map((s) => s.toISOString()) });
}
