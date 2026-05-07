'use client';
import type { FlyingEmoji } from '@/hooks/useMatchReactions';

interface Props {
  flying: FlyingEmoji[];
  onComplete: (id: number) => void;
}

/** Full-viewport, pointer-events: none overlay that animates each
 *  reaction emoji upward and fades it out.
 *
 *  Implementation note: this is intentionally CSS-keyframe driven, not
 *  framer-motion. The previous framer-motion version restarted every
 *  on-screen emoji on each parent re-render — which is exactly what
 *  happens when you spam-click the reaction bar (every click is a
 *  state update). Spam users would see only one emoji at a time
 *  because the list kept getting "reset". CSS keyframes are
 *  per-element and immune to parent re-renders, so 50 emojis can
 *  animate in parallel without colliding.
 *
 *  Each `<span>` rides on `.zi-emoji-fly` (defined in globals.css):
 *  spawns at `bottom: 8vh`, floats ~75vh upward, fades out near the
 *  end, then `onAnimationEnd` calls back so the queue stays bounded. */
export default function FlyingEmojiOverlay({ flying, onComplete }: Props) {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-50"
      style={{ pointerEvents: 'none', overflow: 'hidden' }}
    >
      {flying.map(f => (
        <span
          key={f.id}
          className="zi-emoji-fly"
          style={{ left: `${f.startXFrac * 100}%` }}
          onAnimationEnd={() => onComplete(f.id)}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
}
