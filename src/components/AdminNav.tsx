'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: 'Idag', ic: '☀︎', exact: true },
  { href: '/admin/kalender', label: 'Kalender', ic: '▦' },
  { href: '/admin/bokningar', label: 'Bokningar', ic: '☰' },
  { href: '/admin/tjanster', label: 'Mallar', ic: '◇' },
  { href: '/admin/installningar', label: 'Inställningar', ic: '⚙︎' },
];

export function useActive() {
  const path = usePathname() ?? '';
  return (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + '/'));
}

export function SideNav({ studioName, platform, superadmin }: { studioName: string; platform: string; superadmin: boolean }) {
  const active = useActive();
  return (
    <>
      <div className="brand">
        {studioName}
        <small>{platform}</small>
      </div>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={`nav${active(i.href, i.exact) ? ' on' : ''}`}>
          <span aria-hidden>{i.ic}</span> {i.label}
        </Link>
      ))}
      {superadmin && (
        <Link href="/admin/system" className={`nav${active('/admin/system') ? ' on' : ''}`}>
          <span aria-hidden>⛭</span> System
        </Link>
      )}
    </>
  );
}

export function MobileNav() {
  const active = useActive();
  return (
    <nav className="mobile-nav" aria-label="Meny">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={active(i.href, i.exact) ? 'on' : ''}>
          <span className="ic" aria-hidden>
            {i.ic}
          </span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
