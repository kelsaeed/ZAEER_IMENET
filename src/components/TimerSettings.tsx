'use client';
import { useSettings } from '@/hooks/useSettings';
import { PRESETS, DEFAULT_CUSTOM, presetToTimeControl } from '@/game/timeControl';
import type { TimeControl } from '@/game/types';

interface Props {
  value: TimeControl;
  onChange: (next: TimeControl) => void;
  /** When true, the toggle + presets are forced off and the body shows a
   *  short note. Used by the online create modal in async mode (async
   *  games are always untimed by product decision). */
  disabled?: boolean;
  disabledNote?: string;
}

/** Reusable timer-config block. Used by both the offline-game modal and
 *  the online-create modal so the settings line up across the app. */
export default function TimerSettings({ value, onChange, disabled, disabledNote }: Props) {
  const { theme, t } = useSettings();
  const isOn = value.kind === 'clock';
  const matchMin = isOn ? Math.round(value.matchSeconds / 60) : Math.round(DEFAULT_CUSTOM.matchSeconds / 60);
  const inc = isOn ? value.increment : DEFAULT_CUSTOM.increment;
  const perMove = isOn ? value.perMoveSeconds : DEFAULT_CUSTOM.perMoveSeconds;

  const setOn = (on: boolean) => {
    if (disabled) return;
    if (!on) {
      onChange({ kind: 'none' });
      return;
    }
    onChange({
      kind: 'clock',
      matchSeconds: matchMin * 60,
      increment: inc,
      perMoveSeconds: perMove,
    });
  };

  const setMatchMin = (m: number) => {
    onChange({ kind: 'clock', matchSeconds: Math.max(1, m) * 60, increment: inc, perMoveSeconds: perMove });
  };
  const setInc = (n: number) => {
    onChange({ kind: 'clock', matchSeconds: matchMin * 60, increment: Math.max(0, n), perMoveSeconds: perMove });
  };
  const setPerMove = (n: number) => {
    onChange({ kind: 'clock', matchSeconds: matchMin * 60, increment: inc, perMoveSeconds: Math.max(0, n) });
  };

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: theme.panelBg,
        border: `1px solid ${theme.panelBorder}`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {/* Top row: title + on/off toggle */}
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="text-xs font-bold uppercase tracking-wider opacity-70">⏱ {t('timer.title')}</div>
        <div
          className="flex gap-1 rounded-lg p-1"
          style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}` }}
        >
          <button
            type="button"
            onClick={() => setOn(false)}
            disabled={disabled}
            className="rounded-md py-1 px-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed"
            style={{
              background: !isOn ? theme.buttonRotateBg : 'transparent',
              color: !isOn ? theme.buttonRotateText : theme.textPrimary,
              opacity: !isOn ? 1 : 0.7,
            }}
          >
            {t('timer.off')}
          </button>
          <button
            type="button"
            onClick={() => setOn(true)}
            disabled={disabled}
            className="rounded-md py-1 px-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed"
            style={{
              background: isOn ? theme.buttonRotateBg : 'transparent',
              color: isOn ? theme.buttonRotateText : theme.textPrimary,
              opacity: isOn ? 1 : 0.7,
            }}
          >
            {t('timer.on')}
          </button>
        </div>
      </div>

      {disabled && (
        <div className="text-xs opacity-75 leading-snug py-1">
          {disabledNote ?? t('online.asyncTimerNote')}
        </div>
      )}

      {!disabled && isOn && (
        <>
          {/* Presets */}
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">{t('timer.preset')}</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => {
                const tc = presetToTimeControl(p);
                const selected = isOn
                  && value.matchSeconds === tc.matchSeconds
                  && value.increment === tc.increment
                  && value.perMoveSeconds === 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange(tc)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-transform hover:scale-[1.04] active:scale-95"
                    style={{
                      background: selected ? theme.p1AccentBg : theme.inputBg,
                      border: `1px solid ${selected ? theme.p1Color : theme.buttonBorder}`,
                      color: selected ? theme.p1Color : theme.textPrimary,
                    }}
                  >
                    {t(p.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <NumField
              label={t('timer.matchClock')}
              unit={t('timer.matchClockUnit')}
              value={matchMin}
              min={1}
              max={120}
              onChange={setMatchMin}
              theme={theme}
            />
            <NumField
              label={t('timer.increment')}
              unit={t('timer.incrementUnit')}
              value={inc}
              min={0}
              max={60}
              onChange={setInc}
              theme={theme}
            />
            <NumField
              label={t('timer.perMove')}
              unit={t('timer.perMoveUnit')}
              value={perMove}
              min={0}
              max={600}
              onChange={setPerMove}
              theme={theme}
            />
          </div>
        </>
      )}
    </div>
  );
}

function NumField({
  label, unit, value, min, max, onChange, theme,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  return (
    <label className="text-xs flex flex-col gap-1">
      <span className="opacity-75">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="rounded-md px-2 py-1.5 text-sm font-mono"
        style={{
          background: theme.inputBg,
          color: theme.inputText,
          border: `1px solid ${theme.buttonBorder}`,
        }}
      />
      <span className="opacity-55 text-[10px]">{unit}</span>
    </label>
  );
}
