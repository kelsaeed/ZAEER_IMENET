/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // avoid remount in dev so game state doesn't disappear
};
export default nextConfig;
