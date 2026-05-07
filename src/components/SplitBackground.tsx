'use client';
import { useEffect } from 'react';
import { usePlayerThemes } from '@/hooks/usePlayerThemes';
import { useSettings } from '@/hooks/useSettings';
import { ThemeDecorLayer } from './ThemeDecor';

/** Full-viewport background that paints the page in two halves — top
 *  half = player 2's theme, bottom half = player 1's — so the split
 *  carries through even when the board is centred and surrounded by
 *  empty space. Sits behind everything (z=-10) and never absorbs
 *  pointer events. Falls back to a single bg gradient when both
 *  players share the viewer's theme (single-player flows).
 *
 *  When the two players have *different* themes, this component also
 *  takes over premium-decor rendering: each half gets its own
 *  ThemeDecorLayer scoped to that player's theme. The body picks up
 *  the .zi-split-active class so the layout-level full-screen
 *  ThemeDecor hides itself — no double-stacked sparkles.
 *
 *  Why explicit 100vw / 100dvh and not `inset: 0`: the page reserves
 *  a stable scrollbar gutter on `<html>` (so layout doesn't jump
 *  when content grows past the fold). That gutter narrows the body's
 *  box, and `inset: 0` is relative to body, so it left a thin dark
 *  stripe of body-bg showing through on the right edge in PC view.
 *  Sizing in viewport units pins the bg to the actual viewport
 *  including the gutter; `pointerEvents: none` keeps it from ever
 *  absorbing taps. */
const fullViewportStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100dvh',
  // Fallback for older browsers without dvh support.
  minHeight: '100vh',
  zIndex: -10,
  pointerEvents: 'none',
};

export default function SplitBackground() {
  const themes = usePlayerThemes();
  const { getDecorKind } = useSettings();
  const sameTheme = themes.p1.id === themes.p2.id;

  // Suppress the layout-level full-screen ThemeDecor whenever the
  // split background is rendering two different themes. We only
  // toggle the body class while *split* — same-theme matches still
  // want the layout decor since it spans the whole viewport.
  useEffect(() => {
    if (sameTheme) return;
    document.body.classList.add('zi-split-active');
    return () => document.body.classList.remove('zi-split-active');
  }, [sameTheme]);

  if (sameTheme) {
    return (
      <div
        aria-hidden
        style={{
          ...fullViewportStyle,
          background: themes.viewer.bgGradient,
        }}
      />
    );
  }

  const p1Decor = getDecorKind(themes.p1.id);
  const p2Decor = getDecorKind(themes.p2.id);

  return (
    <>
      <div
        aria-hidden
        className="flex flex-col"
        style={fullViewportStyle}
      >
        <div
          style={{
            flex: 1,
            background: themes.p2.bgGradient,
          }}
        />
        <div
          style={{
            flex: 1,
            background: themes.p1.bgGradient,
          }}
        />
      </div>
      {/* Per-half premium decor. Each layer is fixed-positioned to
          its half via the .zi-celestial-half-* CSS modifiers; we
          render them as siblings of the bg div rather than children
          so the bg stays at z=-10 (behind everything) while the
          decor sits at z=1 (above bg, below interactive controls). */}
      {p2Decor !== 'none' && <ThemeDecorLayer decorKind={p2Decor} placement="half-top" />}
      {p1Decor !== 'none' && <ThemeDecorLayer decorKind={p1Decor} placement="half-bottom" />}
    </>
  );
}
