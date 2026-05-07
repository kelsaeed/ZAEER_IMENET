'use client';
import { useSettings } from '@/hooks/useSettings';
import { REACTION_EMOJIS } from '@/hooks/useMatchReactions';

interface Props {
  onReact: (emoji: string) => void;
  /** Disabled while spectator / send-throttled / etc. */
  disabled?: boolean;
}

/** Grid of emoji buttons. Tap to fire a reaction at the opponent.
 *  Layout is fluid — auto-fits as many columns as the chat panel
 *  width allows so the bar stays compact on narrow phones and
 *  spreads out on wider screens. */
export default function EmojiReactionBar({ onReact, disabled }: Props) {
  const { theme } = useSettings();
  return (
    <div
      className="px-2 py-2 border-t flex flex-wrap gap-1 justify-center"
      style={{
        borderColor: theme.panelBorder,
        background: 'transparent',
      }}
    >
      {REACTION_EMOJIS.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          disabled={disabled}
          aria-label={`React with ${emoji}`}
          className="rounded-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95 disabled:opacity-40"
          style={{
            width: 36,
            height: 36,
            fontSize: 20,
            background: theme.panelBg,
            border: `1px solid ${theme.panelBorder}`,
            cursor: disabled ? 'not-allowed' : 'pointer',
            lineHeight: 1,
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
