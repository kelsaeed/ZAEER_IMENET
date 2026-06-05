'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  listFriendships,
  removeFriendship,
  acceptFriendRequest,
  sendFriendRequest,
  searchProfiles,
  FriendProfile,
} from '@/lib/supabase/friends';
import LoadingEmojis from '@/components/LoadingEmojis';
import Avatar from '@/components/Avatar';
import FriendDm from '@/components/FriendDm';

interface SearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  rating: number;
}

export function FriendsTab({
  theme, user, setError, onChallenge,
}: {
  theme: ReturnType<typeof useSettings>['theme'];
  user: ReturnType<typeof useUser>['user'];
  setError: (e: string | null) => void;
  /** Pop the lobby's create modal so the user can pick mode + timer for
   *  the friend match. (We share the same modal instance to keep choices
   *  in one place — no duplicated UI for friend-specific settings.) */
  onChallenge: () => void;
}) {
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [dmFriend, setDmFriend] = useState<FriendProfile | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await listFriendships(user.id);
      setFriends(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load friends.');
    } finally {
      setLoading(false);
    }
  }, [user, setError]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: refresh on any friendships change.
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowser();
    const ch = supabase
      .channel('friendships-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  // Debounced fuzzy search — runs ~300ms after typing stops.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!user || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchProfiles(q, user.id);
        setSearchResults(results as SearchResult[]);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, user]);

  async function handleAddFromSearch(p: SearchResult) {
    if (!user) return;
    setError(null);
    setActionBusy(`add-${p.id}`);
    try {
      await sendFriendRequest({ myId: user.id, addresseeId: p.id });
      setSearchQuery('');
      setSearchResults([]);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send request.');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleAccept(f: FriendProfile) {
    setActionBusy(`accept-${f.friendshipId}`);
    try {
      await acceptFriendRequest(f.friendshipId);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not accept.');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRemove(f: FriendProfile) {
    if (!confirm(f.status === 'accepted' ? `Remove @${f.username}?` : 'Cancel request?')) return;
    setActionBusy(`remove-${f.friendshipId}`);
    try {
      await removeFriendship(f.friendshipId);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not remove.');
    } finally {
      setActionBusy(null);
    }
  }

  function handleChallenge(_f: FriendProfile) {
    // Punt over to the lobby's create modal so the user gets the same
    // mode + timer picker. After they pick "Create private", they'll get
    // an invite code to send the friend.
    setError(null);
    onChallenge();
  }

  const incoming = friends.filter(f => f.status === 'pending' && !f.outgoing);
  const outgoing = friends.filter(f => f.status === 'pending' && f.outgoing);
  const accepted = friends.filter(f => f.status === 'accepted');

  // Filter out users already in our friendships list (any status) so the
  // search results show people we haven't already requested / friended.
  const knownIds = new Set(friends.map(f => f.id));
  const visibleResults = searchResults.filter(r => !knownIds.has(r.id));

  return (
    <div>
      {/* Add friend — fuzzy search */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
      >
        <div className="text-sm font-bold mb-2">🔎 Find friends</div>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by username or display name…"
          className="w-full rounded-md px-3 py-2 text-sm"
          style={{
            background: theme.inputBg,
            color: theme.inputText,
            border: `1px solid ${theme.buttonBorder}`,
          }}
        />
        {searching && (
          <div className="flex items-center justify-center mt-3"><LoadingEmojis size={14} gap={2} /></div>
        )}
        {!searching && searchQuery.trim().length >= 2 && visibleResults.length === 0 && (
          <div className="text-xs opacity-60 mt-3 text-center">No matching users.</div>
        )}
        {visibleResults.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {visibleResults.map(r => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg p-2"
                style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}` }}
              >
                <Avatar url={r.avatar_url} name={r.display_name} size={32} accent="p2" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{r.display_name}</div>
                  <div className="text-xs opacity-70 truncate">@{r.username} · ★ {r.rating}</div>
                </div>
                <Link
                  href={`/u/${r.username}?from=friends`}
                  className="text-xs opacity-70 hover:opacity-100 px-2"
                >
                  View
                </Link>
                <button
                  onClick={() => handleAddFromSearch(r)}
                  disabled={actionBusy === `add-${r.id}`}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center min-w-[72px]"
                  style={{
                    background: theme.buttonRotateBg,
                    border: `1px solid ${theme.buttonRotateBorder}`,
                    color: theme.buttonRotateText,
                  }}
                >
                  {actionBusy === `add-${r.id}` ? <LoadingEmojis size={12} gap={2} /> : '+ Add'}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10"><LoadingEmojis size={26} /></div>
      ) : (
        <>
          {incoming.length > 0 && (
            <Section title={`📥 Incoming requests (${incoming.length})`}>
              {incoming.map(f => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  theme={theme}
                  busy={actionBusy}
                  primary={{ label: 'Accept', onClick: () => handleAccept(f), busyKey: `accept-${f.friendshipId}` }}
                  secondary={{ label: 'Decline', onClick: () => handleRemove(f), busyKey: `remove-${f.friendshipId}` }}
                />
              ))}
            </Section>
          )}

          {outgoing.length > 0 && (
            <Section title={`📤 Sent (${outgoing.length})`}>
              {outgoing.map(f => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  theme={theme}
                  busy={actionBusy}
                  badge="Pending"
                  secondary={{ label: 'Cancel', onClick: () => handleRemove(f), busyKey: `remove-${f.friendshipId}` }}
                />
              ))}
            </Section>
          )}

          <Section title={`🤝 Friends (${accepted.length})`}>
            {accepted.length === 0 ? (
              <div className="text-sm opacity-60 py-3 text-center">
                No friends yet. Search above to find someone!
              </div>
            ) : (
              accepted.map(f => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  theme={theme}
                  busy={actionBusy}
                  iconAction={{ label: '💬', onClick: () => setDmFriend(f), title: 'Chat' }}
                  primary={{ label: '⚔️ Challenge', onClick: () => handleChallenge(f), busyKey: `challenge-${f.friendshipId}` }}
                  secondary={{ label: 'Remove', onClick: () => handleRemove(f), busyKey: `remove-${f.friendshipId}` }}
                />
              ))
            )}
          </Section>
        </>
      )}

      {/* DM modal */}
      {dmFriend && (
        <FriendDm
          friendId={dmFriend.id}
          friendName={dmFriend.display_name}
          friendAvatarUrl={dmFriend.avatar_url}
          onClose={() => setDmFriend(null)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-sm font-semibold mb-2 opacity-85">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function FriendRow({
  friend, theme, busy, primary, secondary, badge, iconAction,
}: {
  friend: FriendProfile;
  theme: ReturnType<typeof useSettings>['theme'];
  busy: string | null;
  primary?: { label: string; onClick: () => void; busyKey: string };
  secondary?: { label: string; onClick: () => void; busyKey: string };
  badge?: string;
  iconAction?: { label: string; onClick: () => void; title?: string };
}) {
  return (
    <div
      className="rounded-xl p-3 flex items-center gap-2"
      style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
    >
      <Link href={`/u/${friend.username}?from=friends`} className="shrink-0">
        <Avatar url={friend.avatar_url} name={friend.display_name} size={42} />
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/u/${friend.username}?from=friends`} className="font-bold truncate block hover:underline">
          {friend.display_name}
        </Link>
        <div className="text-xs opacity-70 truncate">@{friend.username} · ★ {friend.rating}</div>
      </div>
      {badge && <span className="text-xs opacity-70 px-2 py-1 rounded-full" style={{ background: theme.buttonBg }}>{badge}</span>}
      {iconAction && (
        <button
          onClick={iconAction.onClick}
          title={iconAction.title}
          className="rounded-lg w-9 h-9 inline-flex items-center justify-center text-base hover:scale-110 transition-transform"
          style={{
            background: theme.buttonBg,
            border: `1px solid ${theme.buttonBorder}`,
            color: theme.textPrimary,
          }}
        >
          {iconAction.label}
        </button>
      )}
      {primary && (
        <button
          onClick={primary.onClick}
          disabled={busy === primary.busyKey}
          className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center min-w-[80px]"
          style={{
            background: theme.buttonRotateBg,
            border: `1px solid ${theme.buttonRotateBorder}`,
            color: theme.buttonRotateText,
          }}
        >
          {busy === primary.busyKey ? <LoadingEmojis size={12} gap={2} /> : primary.label}
        </button>
      )}
      {secondary && (
        <button
          onClick={secondary.onClick}
          disabled={busy === secondary.busyKey}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold opacity-70 hover:opacity-100 disabled:opacity-30"
          style={{
            background: theme.buttonBg,
            border: `1px solid ${theme.buttonBorder}`,
            color: theme.textPrimary,
          }}
        >
          {busy === secondary.busyKey ? <LoadingEmojis size={12} gap={2} /> : secondary.label}
        </button>
      )}
    </div>
  );
}
