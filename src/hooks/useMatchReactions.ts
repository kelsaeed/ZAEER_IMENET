'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase/client';

// Curated palette. The first row mirrors the existing brand-y "celebrate"
// set; the rest are the high-emotion reactions players actually want
// during a match (happy / sad / shocked / angry / love / heart / kiss /
// bomb / swear). Keeping the list short and curated avoids a giant
// emoji picker that nobody uses past the first week.
export const REACTION_EMOJIS = [
  '🔥', '🎉', '💃', '🤣', '👏', '💀',
  '🎵', '🤘', '😀', '😢', '😱', '😡',
  '😍', '❤️', '😘', '💣', '🤬',
] as const;

export type ReactionEmoji = typeof REACTION_EMOJIS[number];

/** A single emoji currently flying across the screen. id is monotonic
 *  per-session — used as the React key and for queue cleanup. */
export interface FlyingEmoji {
  id: number;
  emoji: string;
  /** Horizontal start position as a 0..1 fraction of viewport width.
   *  Randomised per emoji so a flurry doesn't stack in one column. */
  startXFrac: number;
  /** Set true when the emoji originated from the local user — useful if
   *  the consumer wants to colour or position own-vs-other reactions
   *  differently. The overlay currently treats them identically. */
  fromMe: boolean;
}

const STORAGE_KEY = 'zaeer.muteReactions';
/** Hard cap so a malicious or laggy peer can't blow up the DOM. Players
 *  asked to be able to spam ~50 reactions at once; 80 gives a comfortable
 *  ceiling above that without putting the page at risk of stutter. */
const MAX_SIMULTANEOUS = 80;

/** Read the mute preference from localStorage with a safe fallback. */
function readMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
}

interface UseMatchReactionsOpts {
  gameId: string | null;
  meId: string | null;
  /** When true, the local user is a spectator — they receive reactions
   *  but cannot send. */
  readOnly?: boolean;
}

/** Hook that wires a Supabase Realtime broadcast channel for ephemeral
 *  emoji reactions in a match. Reactions are NEVER persisted to the
 *  database — they're purely flair, like a sports-stadium crowd wave.
 *
 *  - sendReaction(emoji): broadcasts to peers AND adds the emoji
 *    locally so the sender gets immediate visual feedback.
 *  - flying: the current queue the overlay should render.
 *  - removeFlying(id): the overlay calls this when an emoji's
 *    animation completes so the queue stays bounded.
 *  - muted / setMuted: receiver-side toggle, persisted in localStorage.
 *    Muted players still see their OWN reactions (the click would feel
 *    broken otherwise) — only inbound peer reactions are suppressed.
 */
export function useMatchReactions({ gameId, meId, readOnly }: UseMatchReactionsOpts) {
  const [flying, setFlying] = useState<FlyingEmoji[]>([]);
  const [muted, setMutedState] = useState<boolean>(() => readMuted());

  const channelRef = useRef<RealtimeChannel | null>(null);
  const idRef = useRef<number>(0);
  const mutedRef = useRef<boolean>(muted);
  const meIdRef = useRef<string | null>(meId);

  // Keep refs in sync so the broadcast handler closure (registered once
  // per gameId) reads the latest values without re-subscribing on every
  // mute toggle.
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { meIdRef.current = meId; }, [meId]);

  const addFlying = useCallback((emoji: string, fromMe: boolean) => {
    setFlying(prev => {
      const next = [...prev, {
        id: ++idRef.current,
        emoji,
        startXFrac: 0.15 + Math.random() * 0.7,
        fromMe,
      }];
      // Drop the oldest items if we're over the cap so latency from a
      // dropped frame can't snowball into a stuck queue.
      return next.length > MAX_SIMULTANEOUS
        ? next.slice(next.length - MAX_SIMULTANEOUS)
        : next;
    });
  }, []);

  const removeFlying = useCallback((id: number) => {
    setFlying(prev => prev.filter(f => f.id !== id));
  }, []);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); }
    catch { /* private mode etc. — non-fatal */ }
  }, []);

  // Subscribe to the per-match reaction channel. Re-subscribes only when
  // the game id changes; mute / meId updates are read through refs so a
  // toggle doesn't tear down and re-establish the connection.
  useEffect(() => {
    if (!gameId) return;
    const supabase = getSupabaseBrowser();
    // self: false — the sender never receives their own broadcast. We
    // call addFlying locally on send for own visual feedback, so this
    // keeps the sender from rendering each emoji twice.
    const channel = supabase.channel(`match-reactions:${gameId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'emoji' }, (msg) => {
      const payload = msg.payload as { emoji?: string; sender_id?: string };
      if (!payload?.emoji) return;
      // Mute swallows peer reactions; own reactions never reach this
      // handler (self:false), so we don't need to allow-list ourselves.
      if (mutedRef.current) return;
      addFlying(payload.emoji, false);
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [gameId, addFlying]);

  const sendReaction = useCallback((emoji: string) => {
    if (readOnly) return;
    if (!gameId || !channelRef.current) return;
    // No throttle — players asked to be able to spam-click. The
    // MAX_SIMULTANEOUS cap on the queue is the only floor on how much
    // mayhem ends up in the DOM at once, and the broadcast platform
    // has its own per-project rate limit as a final backstop.
    addFlying(emoji, true);
    void channelRef.current.send({
      type: 'broadcast',
      event: 'emoji',
      payload: { emoji, sender_id: meIdRef.current ?? null },
    });
  }, [gameId, readOnly, addFlying]);

  return { flying, removeFlying, sendReaction, muted, setMuted };
}
