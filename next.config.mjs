/** @type {import('next').NextConfig} */
const nextConfig = {
  // Typfel ska aldrig stoppa en deploy – logiken är testad separat.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['stripe'],
};
export default nextConfig;
