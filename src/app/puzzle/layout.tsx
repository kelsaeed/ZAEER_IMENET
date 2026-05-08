import type { Metadata } from 'next';

// Server-rendered shell around the (client-rendered) puzzle page so we
// can attach SEO + Open Graph metadata. Next.js automatically wires
// the sibling `opengraph-image.tsx` into `metadata.openGraph.images`,
// so this file just needs to fill in the description / title / twitter
// card type — it doesn't have to point at the image URL itself.

export const metadata: Metadata = {
  title: 'Daily Puzzle · Zaeer Imenet',
  description:
    "Today's free daily puzzle for Zaeer Imenet — the ancient strategy game. " +
    'Solve, share, and keep your streak alive.',
  openGraph: {
    title: 'Daily Puzzle · Zaeer Imenet',
    description:
      "Today's free daily puzzle for Zaeer Imenet. " +
      'Solve, share, and keep your streak alive.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Daily Puzzle · Zaeer Imenet',
    description: "Today's free daily puzzle. Solve, share, keep your streak.",
  },
};

export default function PuzzleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
