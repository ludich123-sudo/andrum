import { notFound } from 'next/navigation';
import { getStudioBySlug } from '@/lib/studio';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = await getStudioBySlug(slug);
  return { title: studio ? `Boka – ${studio.name}` : 'Boka' };
}

export default async function StudioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const studio = await getStudioBySlug(slug);
  if (!studio) notFound();
  const accent = /^#[0-9a-f]{3,8}$/i.test(studio.accent_color) ? studio.accent_color : '#5b7a5e';
  return (
    <div className="themed" style={{ ['--accent' as any]: accent }}>
      <div className="container">{children}</div>
      <footer className="public-footer container">
        {studio.name}
        {studio.address ? ` · ${studio.address}` : ''}
        {studio.email ? (
          <>
            {' · '}
            <a href={`mailto:${studio.email}`}>{studio.email}</a>
          </>
        ) : null}
      </footer>
    </div>
  );
}
