import Link from 'next/link';
import CourseWizard from '@/components/CourseWizard';
import Flash from '@/components/Flash';
import { requireStudio } from '@/lib/auth';
import { db } from '@/lib/db';
import { Service } from '@/lib/types';
import { toDateKey } from '@/lib/tz';
import { createCourseAction } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function NewCoursePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { studio } = await requireStudio();
  const { data } = await db()
    .from('services')
    .select('*')
    .eq('studio_id', studio.id)
    .eq('kind', 'course')
    .eq('active', true)
    .order('sort')
    .order('name');
  const templates = ((data ?? []) as Service[]).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    duration_min: t.duration_min,
    price_ore: t.price_ore,
    capacity: t.capacity,
    sessions_count: t.sessions_count,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ny kurs</h1>
          <p className="muted mb0">Kunden bokar och betalar alla tillfällen på en gång och får påminnelse före varje.</p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {templates.length === 0 ? (
        <div className="card">
          <p className="mb0">
            Du har ingen kursmall än. <Link href="/admin/tjanster">Skapa en mall</Link> av typen Kurs först.
          </p>
        </div>
      ) : (
        <CourseWizard templates={templates} today={toDateKey(new Date(), studio.timezone)} action={createCourseAction} />
      )}
    </>
  );
}
