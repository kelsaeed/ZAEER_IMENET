'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { useUser } from '@/hooks/useUser';
import {
  listThemeCatalog,
  acquireFreeTheme,
  redeemThemeCode,
  effectivePriceCents,
  isCurrentlyFree,
  type ThemeCatalogRow,
} from '@/lib/supabase/themeStore';

/** Cosmetic theme storefront. Lists every published row from
 *  themes_catalog, lets signed-in users claim free themes (or themes
 *  inside a free_until window / 100%-off discount), gates paid ones
 *  behind a "Coming soon" pill until Stripe is wired up, and lets
 *  anyone redeem a one-time code for free ownership. Admins see
 *  Equip on every card regardless of ownership.
 *
 *  Preview: every card has a "Try it" button that flips the entire
 *  site to that theme via setPreviewThemeId. The PreviewBanner
 *  follows the user across pages until they stop or equip. */
export default function ThemeStorePage() {
  const {
    theme, themeId, setThemeId, isRTL, t, locale,
    previewThemeId, setPreviewThemeId,
  } = useSettings();
  const { user, profile, ownedThemeIds, reloadOwnership } = useUser();
  const isArabic = locale.dir === 'rtl';
  const isAdmin = !!profile?.is_admin;

  const [catalog, setCatalog] = useState<ThemeCatalogRow[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Re-render every minute so countdown labels (free until / discount
  // ends in) refresh without the user having to reload the page.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

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
    setThemeId(row.id);
    setPreviewThemeId(null);
    setPendingId(null);
  }

  function handleEquip(row: ThemeCatalogRow) {
    setThemeId(row.id);
    setPreviewThemeId(null);
  }

  function handlePreview(row: ThemeCatalogRow) {
    // Toggle: clicking preview on the same card stops the preview.
    setPreviewThemeId(previewThemeId === row.id ? null : row.id);
  }

  async function handleRedeem() {
    if (!user) {
      setRedeemMsg({ kind: 'err', text: t('store.redeemSignIn') });
      return;
    }
    if (!redeemInput.trim()) return;
    setRedeeming(true);
    setRedeemMsg(null);
    const ok = await redeemThemeCode(redeemInput);
    setRedeeming(false);
    if (!ok) {
      setRedeemMsg({ kind: 'err', text: t('store.redeemError') });
      return;
    }
    setRedeemInput('');
    setRedeemMsg({ kind: 'ok', text: t('store.redeemOk') });
    await reloadOwnership();
  }

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen w-full px-4 sm:px-6 py-8 pt-16 pb-24"
      style={{ minHeight: '100dvh', background: theme.bgGradient, color: theme.textPrimary }}
    >
      <div className="max-w-5xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
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
          {isAdmin && (
            <Link
              href="/admin/themes"
              className="rounded-full px-3 py-1.5 text-xs font-bold"
              style={{
                background: theme.p2AccentBg,
                border: `1px solid ${theme.p2AccentBorder}`,
                color: theme.p2Color,
              }}
            >
              🛡️ {t('admin.themes.openCta')}
            </Link>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-1" style={{ color: theme.p1Color }}>
          🎨 {t('store.title')}
        </h1>
        <p className="text-sm sm:text-base" style={{ color: theme.textMuted }}>
          {t('store.subtitle')}
        </p>
      </div>

      {/* Sign-in nudge */}
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

      {/* Redeem code section — visible to everyone, but only useful
          when signed in (RPC requires auth.uid()). */}
      <div
        className="max-w-5xl mx-auto mb-6 rounded-xl p-4"
        style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
      >
        <div className="text-sm font-semibold mb-2" style={{ color: theme.textPrimary }}>
          🎟️ {t('store.redeemTitle')}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={redeemInput}
            onChange={e => setRedeemInput(e.target.value.toUpperCase())}
            placeholder={t('store.redeemPlaceholder')}
            className="flex-1 min-w-[10rem] rounded-md px-3 py-2 text-sm font-mono"
            style={{
              background: theme.inputBg,
              border: `1px solid ${theme.buttonBorder}`,
              color: theme.inputText,
              letterSpacing: '0.08em',
            }}
            maxLength={32}
          />
          <button
            onClick={handleRedeem}
            disabled={redeeming || !redeemInput.trim()}
            className="rounded-md px-4 py-2 text-sm font-bold transition-transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            {redeeming ? t('store.redeemBusy') : t('store.redeemCta')}
          </button>
        </div>
        {redeemMsg && (
          <div
            className="text-xs mt-2"
            style={{
              color: redeemMsg.kind === 'ok' ? theme.buttonRotateText : theme.buttonEndTurnText,
            }}
          >
            {redeemMsg.text}
          </div>
        )}
      </div>

      {catalog === null && (
        <div className="max-w-5xl mx-auto text-center py-12 opacity-70">
          {t('store.loading')}
        </div>
      )}

      {catalog !== null && catalog.length === 0 && (
        <div
          className="max-w-5xl mx-auto rounded-xl p-6 text-center"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textMuted }}
        >
          {t('store.empty')}
        </div>
      )}

      {catalog !== null && catalog.length > 0 && (
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalog.map((row, i) => (
            <ThemeCard
              key={row.id}
              row={row}
              now={now}
              isArabic={isArabic}
              isEquipped={themeId === row.id}
              isPreviewing={previewThemeId === row.id}
              isOwned={ownedThemeIds.has(row.id) || isAdmin}
              isAdmin={isAdmin}
              isSignedIn={!!user}
              isPending={pendingId === row.id}
              hasError={errorId === row.id}
              onClaim={() => handleClaim(row)}
              onEquip={() => handleEquip(row)}
              onPreview={() => handlePreview(row)}
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
  now: Date;
  isArabic: boolean;
  isEquipped: boolean;
  isPreviewing: boolean;
  isOwned: boolean;
  isAdmin: boolean;
  isSignedIn: boolean;
  isPending: boolean;
  hasError: boolean;
  onClaim: () => void;
  onEquip: () => void;
  onPreview: () => void;
  animationDelay: number;
}

function ThemeCard({
  row, now, isArabic, isEquipped, isPreviewing, isOwned, isAdmin, isSignedIn,
  isPending, hasError, onClaim, onEquip, onPreview, animationDelay,
}: CardProps) {
  const { theme: hostTheme, t, resolveThemeById } = useSettings();
  const preview = useMemo(() => resolveThemeById(row.id) ?? hostTheme, [row.id, hostTheme, resolveThemeById]);

  const effective = effectivePriceCents(row, now);
  const isFreeNow = isCurrentlyFree(row, now);
  const isDiscounted = effective < row.price_cents && row.price_cents > 0;
  const isFreeWindow = row.free_until && new Date(row.free_until) > now;

  const displayName = isArabic && row.display_name_ar ? row.display_name_ar : row.display_name;
  const description = isArabic && row.description_ar ? row.description_ar : row.description;

  const priceLabel = isFreeNow
    ? t('store.priceFree')
    : `$${(effective / 100).toFixed(2)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animationDelay, duration: 0.3 }}
      className="rounded-2xl overflow-hidden flex flex-col relative"
      style={{
        background: hostTheme.panelBg,
        border: `1px solid ${
          isEquipped ? preview.selectedRing
          : isPreviewing ? hostTheme.p2AccentBorder
          : hostTheme.panelBorder
        }`,
        boxShadow: isPreviewing ? `0 0 0 2px ${hostTheme.p2AccentBorder}` : undefined,
      }}
    >
      {/* Premium ribbon */}
      {row.is_premium && (
        <div
          className="absolute top-2 right-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
          style={{
            background: 'linear-gradient(135deg, #fbbf24, #f472b6, #a78bfa)',
            color: '#1a0d2e',
          }}
        >
          ✦ {t('store.premiumPill')}
        </div>
      )}

      {/* Preview strip */}
      <div
        className="p-4"
        style={{ background: preview.bgGradient }}
      >
        <div className="flex items-center justify-between mb-3 gap-2">
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-7 h-7 rounded" style={{ background: preview.cellLight, border: `1px solid ${preview.boardBorder}` }} />
          <span className="w-7 h-7 rounded" style={{ background: preview.cellDark, border: `1px solid ${preview.boardBorder}` }} />
          <span className="w-7 h-7 rounded" style={{ background: preview.throneBg, border: `1px solid ${preview.throneBorder}` }} />
          <span className="w-7 h-7 rounded" style={{ background: preview.barrierBg, border: `1px solid ${preview.barrierBorder}` }} />
          <span className="mx-1 opacity-50" style={{ color: preview.textMuted }}>·</span>
          <span className="w-6 h-6 rounded-full" style={{ background: preview.p1Color, border: `1px solid ${preview.p1Border}` }} />
          <span className="w-6 h-6 rounded-full" style={{ background: preview.p2Color, border: `1px solid ${preview.p2Border}` }} />
        </div>
      </div>

      {/* Discount / free-until banner */}
      {(isDiscounted || isFreeWindow) && (
        <div
          className="px-4 py-1.5 text-xs font-bold flex items-center gap-2"
          style={{
            background: hostTheme.buttonRotateBg,
            color: hostTheme.buttonRotateText,
            borderTop: `1px solid ${hostTheme.buttonRotateBorder}`,
          }}
        >
          {isFreeWindow ? (
            <>🎁 {t('store.freeUntilLabel')} {formatDate(row.free_until!, isArabic)}</>
          ) : (
            <>
              🔥 {row.discount_pct}% {t('store.discountLabel')}
              {row.discount_ends_at && (
                <> · {t('store.endsOnLabel')} {formatDate(row.discount_ends_at, isArabic)}</>
              )}
            </>
          )}
        </div>
      )}

      {/* Description + CTA */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {description && (
          <p className="text-sm flex-1" style={{ color: hostTheme.textMuted }}>
            {description}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold" style={{ color: hostTheme.textPrimary }}>
              {priceLabel}
            </span>
            {isDiscounted && (
              <span className="text-xs line-through opacity-60" style={{ color: hostTheme.textMuted }}>
                ${(row.price_cents / 100).toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onPreview}
              className="text-xs font-semibold rounded-full px-3 py-1.5 transition-transform hover:scale-105"
              style={{
                background: isPreviewing ? hostTheme.p2AccentBg : hostTheme.buttonBg,
                border: `1px solid ${isPreviewing ? hostTheme.p2AccentBorder : hostTheme.buttonBorder}`,
                color: isPreviewing ? hostTheme.p2Color : hostTheme.textPrimary,
              }}
            >
              {isPreviewing ? `✕ ${t('store.previewStop')}` : `👁 ${t('store.previewCta')}`}
            </button>
            <CardCta
              isFree={isFreeNow}
              isOwned={isOwned}
              isEquipped={isEquipped}
              isAdmin={isAdmin}
              isSignedIn={isSignedIn}
              isPending={isPending}
              onClaim={onClaim}
              onEquip={onEquip}
            />
          </div>
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
  isAdmin: boolean;
  isSignedIn: boolean;
  isPending: boolean;
  onClaim: () => void;
  onEquip: () => void;
}

function CardCta({ isFree, isOwned, isEquipped, isAdmin, isSignedIn, isPending, onClaim, onEquip }: CtaProps) {
  const { theme, t } = useSettings();

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
        {isAdmin ? `🛡 ${t('store.equip')}` : t('store.equip')}
      </button>
    );
  }

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

function formatDate(iso: string, isArabic: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(isArabic ? 'ar' : 'en', { month: 'short', day: 'numeric' });
}
