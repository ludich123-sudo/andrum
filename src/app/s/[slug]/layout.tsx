import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudioBySlug, studioAccent } from '@/lib/studio';

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
  return (
    <div className="themed" style={{ ['--accent' as any]: studioAccent(studio.accent_color) }}>
      <div className="topbar">
        <div className="container">
          <Link href={`/s/${slug}`} className="brand">
            {studio.name}
            <i>.</i>
          </Link>
          {studio.email && (
            <a className="contact" href={`mailto:${studio.email}`}>
              Kontakt
            </a>
          )}
        </div>
      </div>
      <div className="container">{children}</div>
      <footer className="public-footer container">
        <span className="serif">Varmt välkommen.</span>
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
