/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // avoid remount in dev so game state doesn't disappear
  experimental: {
    // Tree-shake / barrel-optimise the heaviest shared deps so each route
    // ships and parses less JS on a cold load. framer-motion is imported
    // by almost every component; without this its whole barrel rides
    // along on the first paint of every page, which is the main reason a
    // fresh refresh felt janky on the deployed site.
    optimizePackageImports: ['framer-motion', '@supabase/supabase-js', '@supabase/ssr'],
  },
};
export default nextConfig;
