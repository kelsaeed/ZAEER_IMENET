import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';

// Server-side gate for every /admin/* route. Runs on each request,
// before any client code or page chunk is sent. Visitors who aren't
// signed in OR aren't flagged is_admin in their profile get the
// standard Next 404, identical to a non-existent route — there's no
// distinguishable signal that an admin section even exists, no
// redirect to a login form that hints at a hidden surface.
//
// Admin pages still keep their per-page client-side checks too as a
// belt-and-suspenders measure (and for snappy UX after a profile
// flag toggles), but this layout is the authoritative gate.

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) notFound();

  return <>{children}</>;
}
