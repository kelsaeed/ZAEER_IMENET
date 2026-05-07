'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { useUser } from '@/hooks/useUser';
import { getThemeById } from '@/game/themes';
import {
  listThemeCatalog,
  acquireFreeTheme,
  type ThemeCatalogRow,
} from '@/lib/supabase/themeStore';

/** Cosmetic theme storefront. Lists every published row from
 *  themes_catalog, lets signed-in users claim free themes, and gates
 *  paid ones behind a "Coming soon" pill until Stripe is wired up.
 *
 *  Lives at /store rather than under /profile so the URL is short
 *  enough to share ("zaeer.app/store") and signed-out browsers can
 *  preview the catalog before deciding to sign up. */
export default function ThemeStorePage() {
  const { theme, themeId, setThemeId, isRTL, t, locale } = useSettings();
  const { user, ownedThemeIds, reloadOwnership } = useUser();
  const isArabic = locale.dir === 'rtl';

  const [catalog, setCatalog] = useState<ThemeCatalogRow[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  // Initial load. Catalog is public — no auth required. We don't
  // subscribe to Realtime here because admin-side price/copy edits
  // are rare; a refresh picks them up.
  useEffect(() => {
    let mounted = true;
    void listThemeCatalog().then(rows => {
      if (mounted) setCatalog(rows);
    });
    return () => { mounted = false; };
  }, []);

  async function handleClaim(row: ThemeCatalogRow) {
    if (!user) return;
    setErrorId(null);
    setPendingId(row.id);
    const ok = await acquireFreeTheme(row.id);
    if (!ok) {
      setErrorId(row.id);
      setPendingId(null);
      return;
    }
    await reloadOwnership();
    // Auto-equip on first claim — the user just expressed intent.
    setThemeId(row.id);
    setPendingId(null);
  }

  function handleEquip(row: ThemeCatalogRow) {
    setThemeId(row.id);
  }

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen w-full px-4 sm:px-6 py-8 pt-16"
      style={{ minHeight: '100dvh', background: theme.bgGradient, color: theme.textPrimary }}
    >
      {/* Header */}
      <div className="max-w-5xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/"
            className="rounded-full px-3 py-1.5 text-sm font-semibold transition-transform hover:scale-105"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.panelBorder}`,
              color: theme.textPrimary,
            }}
          >
            {isRTL ? '→' : '←'} {t('store.back')}
          </Link>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-1" style={{ color: theme.p1Color }}>
          🎨 {t('store.title')}
        </h1>
        <p className="text-sm sm:text-base" style={{ color: theme.textMuted }}>
          {t('store.subtitle')}
        </p>
      </div>

      {/* Sign-in nudge — only when signed out, so signed-in users don't
          see a banner that doesn't apply to them. */}
      {!user && (
        <div
          className="max-w-5xl mx-auto mb-4 rounded-xl px-4 py-3 text-sm flex flex-wrap items-center gap-3"
          style={{ background: theme.panelBg, border: `1px solid ${theme.p1AccentBorder}`, color: theme.textPrimary }}
        >
          <span className="flex-1 min-w-[12rem]">{t('store.signInPrompt')}</span>
          <Link
            href="/login"
            className="rounded-full px-3 py-1.5 text-xs font-bold"
            style={{ background: theme.p1AccentBg, border: `1px solid ${theme.p1AccentBorder}`, color: theme.p1Color }}
          >
            {t('store.signInCta')}
          </Link>
        </div>
      )}

      {/* Loading state */}
      {catalog === null && (
        <div className="max-w-5xl mx-auto text-center py-12 opacity-70">
          {t('store.loading')}
        </div>
      )}

      {/* Empty state — most likely cause is the migration hasn't run. */}
      {catalog !== null && catalog.length === 0 && (
        <div
          className="max-w-5xl mx-auto rounded-xl p-6 text-center"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textMuted }}
        >
          {t('store.empty')}
        </div>
      )}

      {/* Grid of theme cards */}
      {catalog !== null && catalog.length > 0 && (
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalog.map((row, i) => (
            <ThemeCard
              key={row.id}
              row={row}
              isArabic={isArabic}
              isEquipped={themeId === row.id}
              isOwned={ownedThemeIds.has(row.id)}
              isSignedIn={!!user}
              isPending={pendingId === row.id}
              hasError={errorId === row.id}
              onClaim={() => handleClaim(row)}
              onEquip={() => handleEquip(row)}
              animationDelay={Math.min(i * 0.05, 0.4)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────

interface CardProps {
  row: ThemeCatalogRow;
  isArabic: boolean;
  isEquipped: boolean;
  isOwned: boolean;
  isSignedIn: boolean;
  isPending: boolean;
  hasError: boolean;
  onClaim: () => void;
  onEquip: () => void;
  animationDelay: number;
}

function ThemeCard({
  row, isArabic, isEquipped, isOwned, isSignedIn,
  isPending, hasError, onClaim, onEquip, animationDelay,
}: CardProps) {
  const { theme: hostTheme, t } = useSettings();
  // Look up the actual Theme object so we can render a real preview
  // (gradient + checkerboard + piece dots) instead of just a name. If
  // the catalog references an id we don't ship in code yet, fall back
  // to the host theme's colors so the card still renders.
  const preview = useMemo(() => getThemeById(row.id) ?? hostTheme, [row.id, hostTheme]);

  const isFree = row.price_cents === 0;
  const displayName = isArabic && row.display_name_ar ? row.display_name_ar : row.display_name;
  const description = isArabic && row.description_ar ? row.description_ar : row.description;

  const priceLabel = isFree
    ? t('store.priceFree')
    : `$${(row.price_cents / 100).toFixed(2)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animationDelay, duration: 0.3 }}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: hostTheme.panelBg,
        border: `1px solid ${isEquipped ? preview.selectedRing : hostTheme.panelBorder}`,
      }}
    >
      {/* Preview strip — shows the theme's actual board / piece colors
          on its own gradient so a card for "Crimson Empire" feels red
          even on a navy host page. */}
      <div
        className="p-4"
        style={{ background: preview.bgGradient }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-base" style={{ color: preview.textPrimary }}>
            {displayName}
          </div>
          {isEquipped && (
            <span
              className="text-xs font-semibold rounded-full px-2 py-0.5"
              style={{
                background: preview.p1AccentBg,
                border: `1px solid ${preview.p1AccentBorder}`,
                color: preview.p1Color,
              }}
            >
              {t('store.activePill')}
            </span>
          )}
        </div>
        {/* Mini board: 4 cells (light/dark/throne/barrier) + 2 piece dots */}
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded" style={{ background: preview.cellLight, border: `1px solid ${preview.boardBorder}` }} />
          <span className="w-7 h-7 rounded" style={{ background: preview.cellDark, border: `1px solid ${preview.boardBorder}` }} />
          <span className="w-7 h-7 rounded" style={{ background: preview.throneBg, border: `1px solid ${preview.throneBorder}` }} />
          <span className="w-7 h-7 rounded" style={{ background: preview.barrierBg, border: `1px solid ${preview.barrierBorder}` }} />
          <span className="mx-1 opacity-50" style={{ color: preview.textMuted }}>·</span>
          <span className="w-6 h-6 rounded-full" style={{ background: preview.p1Color, border: `1px solid ${preview.p1Border}` }} />
          <span className="w-6 h-6 rounded-full" style={{ background: preview.p2Color, border: `1px solid ${preview.p2Border}` }} />
        </div>
      </div>

      {/* Description + CTA — uses the HOST page's theme so the controls
          are consistent across cards regardless of which palette the
          card is previewing. */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {description && (
          <p className="text-sm flex-1" style={{ color: hostTheme.textMuted }}>
            {description}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-sm font-bold" style={{ color: hostTheme.textPrimary }}>
            {priceLabel}
          </span>
          <CardCta
            isFree={isFree}
            isOwned={isOwned}
            isEquipped={isEquipped}
            isSignedIn={isSignedIn}
            isPending={isPending}
            onClaim={onClaim}
            onEquip={onEquip}
          />
        </div>

        {hasError && (
          <div className="text-xs" style={{ color: hostTheme.buttonEndTurnText }}>
            {t('store.claimError')}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── CTA button ──────────────────────────────────────────────────────────

interface CtaProps {
  isFree: boolean;
  isOwned: boolean;
  isEquipped: boolean;
  isSignedIn: boolean;
  isPending: boolean;
  onClaim: () => void;
  onEquip: () => void;
}

function CardCta({ isFree, isOwned, isEquipped, isSignedIn, isPending, onClaim, onEquip }: CtaProps) {
  const { theme, t } = useSettings();

  // Owned + currently equipped → quiet "Active" badge, no action.
  if (isOwned && isEquipped) {
    return (
      <span
        className="text-xs font-bold rounded-full px-3 py-1.5"
        style={{
          background: theme.buttonRotateBg,
          border: `1px solid ${theme.buttonRotateBorder}`,
          color: theme.buttonRotateText,
        }}
      >
        ✓ {t('store.activePill')}
      </span>
    );
  }

  // Owned but not equipped → big "Equip" button.
  if (isOwned && !isEquipped) {
    return (
      <button
        onClick={onEquip}
        className="text-xs font-bold rounded-full px-3 py-1.5 transition-transform hover:scale-105"
        style={{
          background: theme.buttonSwitchBg,
          border: `1px solid ${theme.buttonSwitchBorder}`,
          color: theme.buttonSwitchText,
        }}
      >
        {t('store.equip')}
      </button>
    );
  }

  // Not owned + paid → no payment flow yet, show a soft "Coming soon".
  if (!isFree) {
    return (
      <span
        className="text-xs font-semibold rounded-full px-3 py-1.5 opacity-80"
        style={{
          background: theme.buttonBg,
          border: `1px solid ${theme.buttonBorder}`,
          color: theme.textMuted,
        }}
      >
        {t('store.comingSoon')}
      </span>
    );
  }

  // Not owned + free + signed-out → bounce to login.
  if (!isSignedIn) {
    return (
      <Link
        href="/login"
        className="text-xs font-bold rounded-full px-3 py-1.5"
        style={{
          background: theme.buttonBg,
          border: `1px solid ${theme.buttonBorder}`,
          color: theme.textPrimary,
        }}
      >
        {t('store.signInToClaim')}
      </Link>
    );
  }

  // Not owned + free + signed-in → claim CTA.
  return (
    <button
      onClick={onClaim}
      disabled={isPending}
      className="text-xs font-bold rounded-full px-3 py-1.5 transition-transform hover:scale-105 disabled:opacity-60 disabled:cursor-wait"
      style={{
        background: theme.buttonRotateBg,
        border: `1px solid ${theme.buttonRotateBorder}`,
        color: theme.buttonRotateText,
      }}
    >
      {isPending ? t('store.claiming') : t('store.claimFree')}
    </button>
  );
}
