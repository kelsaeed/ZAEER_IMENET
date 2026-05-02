'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import Avatar from './Avatar';

export interface ChatPanelMessage {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name: string | null;
  sender_avatar: string | null;
}

interface Props {
  /** Whether the panel is visible. */
  open: boolean;
  /** Title at the top of the panel. */
  title: string;
  /** Localized empty-state message. */
  emptyText?: string;
  /** Current messages, ordered oldest → newest. */
  messages: ChatPanelMessage[];
  /** ID of the local user (so we can right-align their bubbles). */
  meId: string | null;
  /** Send-message callback (parent handles the actual network write). */
  onSend: (body: string) => Promise<void> | void;
  onClose: () => void;
  /** Pixel width on lg+ screens. Defaults to 320. */
  width?: number;
  /** Top inset on viewport (so we don't cover the AuthBadge). */
  topInset?: number;
  /** Disable input (e.g. spectator). */
  readOnly?: boolean;
  /** Hint shown below the input when read-only. */
  readOnlyHint?: string;
}

export default function ChatPanel({
  open, title, emptyText, messages, meId, onSend, onClose,
  width = 320, topInset = 12, readOnly = false, readOnlyHint,
}: Props) {
  const { theme } = useSettings();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the latest message whenever it lands or the panel opens.
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setErr(null);
    setSending(true);
    try {
      await onSend(trimmed);
      setBody('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2 }}
          className="fixed z-40 rounded-2xl shadow-2xl flex flex-col"
          style={{
            top: topInset,
            right: 12,
            width,
            maxWidth: 'calc(100vw - 24px)',
            height: `min(580px, calc(100dvh - ${topInset + 24}px))`,
            background: theme.bgGradient,
            border: `1px solid ${theme.panelBorder}`,
            backdropFilter: 'blur(8px)',
            color: theme.textPrimary,
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: theme.panelBorder }}
          >
            <span className="font-bold text-sm truncate">{title}</span>
            <button
              onClick={onClose}
              className="opacity-70 hover:opacity-100 text-base px-2 -mx-1"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {messages.length === 0 ? (
              <div className="text-center text-xs opacity-60 mt-8">
                {emptyText ?? 'Say hi 👋'}
              </div>
            ) : (
              messages.map(m => {
                const mine = meId !== null && m.sender_id === meId;
                return (
                  <div key={m.id} className={`flex gap-2 items-end ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                    {!mine && (
                      <Avatar
                        url={m.sender_avatar}
                        name={m.sender_name}
                        size={26}
                        accent={mine ? 'p1' : 'p2'}
                      />
                    )}
                    <div
                      className="rounded-2xl px-3 py-1.5 text-sm max-w-[75%] break-words"
                      style={{
                        background: mine ? theme.p1AccentBg : theme.panelBg,
                        border: `1px solid ${mine ? theme.p1AccentBorder : theme.panelBorder}`,
                        color: theme.textPrimary,
                        borderBottomRightRadius: mine ? 4 : undefined,
                        borderBottomLeftRadius: !mine ? 4 : undefined,
                      }}
                    >
                      {!mine && (
                        <div className="text-[10px] opacity-60 mb-0.5">
                          {m.sender_name ?? 'Player'}
                        </div>
                      )}
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {err && (
            <div
              className="text-xs px-3 py-1.5 mx-2 mb-1 rounded"
              style={{
                background: 'rgba(220,38,38,0.15)',
                border: '1px solid rgba(220,38,38,0.4)',
                color: '#fecaca',
              }}
            >
              {err}
            </div>
          )}

          {readOnly ? (
            <div
              className="px-3 py-2 text-xs opacity-70 border-t text-center"
              style={{ borderColor: theme.panelBorder }}
            >
              {readOnlyHint ?? 'Read-only.'}
            </div>
          ) : (
            <form onSubmit={submit} className="flex gap-2 p-2 border-t" style={{ borderColor: theme.panelBorder }}>
              <input
                type="text"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Message…"
                maxLength={500}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm"
                style={{
                  background: theme.inputBg,
                  color: theme.inputText,
                  border: `1px solid ${theme.buttonBorder}`,
                }}
              />
              <button
                type="submit"
                disabled={!body.trim() || sending}
                className="rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-40"
                style={{
                  background: theme.buttonRotateBg,
                  border: `1px solid ${theme.buttonRotateBorder}`,
                  color: theme.buttonRotateText,
                }}
                aria-label="Send"
              >
                ➤
              </button>
            </form>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
