import { NextRequest, NextResponse } from 'next/server';

// Egen domän per studio: boka.studio.se → /s/<studio>.
// Appens egen adress (och *.vercel.app) passerar orörd.

const cache = new Map<string, { slug: string | null; at: number }>();
const TTL = 5 * 60_000;

async function slugForHost(host: string): Promise<string | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL) return hit.slug;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/studios?custom_domain=eq.${encodeURIComponent(host)}&select=slug`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const rows = res.ok ? await res.json() : [];
    const slug = rows?.[0]?.slug ?? null;
    cache.set(host, { slug, at: Date.now() });
    return slug;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  // Vercels egna adresser och localhost passerar orörda. Alla andra värdar slås upp
  // (även om Vercel räknar en studios domän som projektets huvuddomän).
  if (!host || host.endsWith('.vercel.app') || host === 'localhost') return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (path.startsWith('/s/') || path.startsWith('/api/') || path.startsWith('/admin')) return NextResponse.next();

  const slug = await slugForHost(host);
  if (!slug) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/s/${slug}${path === '/' ? '' : path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
