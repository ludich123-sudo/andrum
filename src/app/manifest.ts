import type { MetadataRoute } from 'next';

// Gör adminpanelen installerbar på telefonens hemskärm.
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.PLATFORM_NAME || 'Andrum';
  return {
    name: `${name} – admin`,
    short_name: name,
    start_url: '/admin',
    display: 'standalone',
    background_color: '#f6f3ee',
    theme_color: '#5b7a5e',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
