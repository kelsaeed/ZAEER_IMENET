'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { builtInLocale } from '@/game/locales';

interface Props {
  onClose: () => void;
}

type Tab = 'theme' | 'language' | 'translations';

export default function SettingsPanel({ onClose }: Props) {
  const {
    theme, themeId, themes, setThemeId,
    customColors, setCustomColor, resetCustomColors,
    locale, locales, setLocaleId, isRTL,
    t, addCustomLocale, removeCustomLocale, isBuiltIn,
    setTranslation, resetTranslation,
  } = useSettings();

  const [tab, setTab] = useState<Tab>('theme');

  // Custom-language form
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newFlag, setNewFlag] = useState('🏳️');
  const [newBase, setNewBase] = useState('en');
  const [newDir, setNewDir] = useState<'ltr' | 'rtl'>('ltr');

  // Translation editor
  const [editLocaleId, setEditLocaleId] = useState(locale.id);
  const [search, setSearch] = useState('');
  const editLocale = locales.find(l => l.id === editLocaleId) ?? locale;

  // Keys come from English (canonical source), fall back to whatever the locale has.
  const allKeys = useMemo(() => {
    const en = builtInLocale('en');
    const set = new Set<string>(en ? Object.keys(en.strings) : []);
    Object.keys(editLocale.strings).forEach(k => set.add(k));
    return Array.from(set).sort();
  }, [editLocale]);

  const filteredKeys = useMemo(() => {
    if (!search.trim()) return allKeys;
    const q = search.toLowerCase();
    return allKeys.filter(k =>
      k.toLowerCase().includes(q) ||
      (editLocale.strings[k] ?? '').toLowerCase().includes(q)
    );
  }, [allKeys, search, editLocale]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-3"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      >
        <motion.div
          dir={isRTL ? 'rtl' : 'ltr'}
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 10 }}
          onClick={e => e.stopPropagation()}
          className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          style={{
            background: theme.bgGradient,
            color: theme.textPrimary,
            border: `1px solid ${theme.panelBorder}`,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: theme.panelBorder }}>
            <h2 className="text-xl font-bold">⚙️ {t('settings.title')}</h2>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1 text-sm"
              style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}` }}
            >
              {t('settings.close')} ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-2 border-b" style={{ borderColor: theme.panelBorder }}>
            {([
              ['theme', t('settings.theme')],
              ['language', t('settings.language')],
              ['translations', t('settings.editTranslations')],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold flex-1"
                style={{
                  background: tab === id ? theme.buttonRotateBg : theme.buttonBg,
                  border: `1px solid ${tab === id ? theme.buttonRotateBorder : theme.buttonBorder}`,
                  color: tab === id ? theme.buttonRotateText : theme.textPrimary,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'theme' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {themes.map(th => (
                    <button
                      key={th.id}
                      onClick={() => setThemeId(th.id)}
                      className="rounded-xl p-3 text-start transition-transform hover:scale-[1.02]"
                      style={{
                        background: th.bgGradient,
                        border: `2px solid ${themeId === th.id ? th.selectedRing : 'transparent'}`,
                        color: th.textPrimary,
                      }}
                    >
                      <div className="font-bold mb-2">{th.name}</div>
                      <div className="flex gap-1 mb-2">
                        <span className="w-6 h-6 rounded" style={{ background: th.cellLight, border: `1px solid ${th.boardBorder}` }} />
                        <span className="w-6 h-6 rounded" style={{ background: th.cellDark, border: `1px solid ${th.boardBorder}` }} />
                        <span className="w-6 h-6 rounded" style={{ background: th.throneBg, border: `1px solid ${th.throneBorder}` }} />
                        <span className="w-6 h-6 rounded" style={{ background: th.barrierBg, border: `1px solid ${th.barrierBorder}` }} />
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="w-5 h-5 rounded-full" style={{ background: th.p1Color, border: `1px solid ${th.p1Border}` }} />
                        <span className="w-5 h-5 rounded-full" style={{ background: th.p2Color, border: `1px solid ${th.p2Border}` }} />
                        <span className="text-xs opacity-70">{themeId === th.id ? '✓' : ''}</span>
                      </div>
                    </button>
                  ))}

                  {/* Custom theme tile */}
                  <button
                    onClick={() => setThemeId('custom')}
                    className="rounded-xl p-3 text-start transition-transform hover:scale-[1.02]"
                    style={{
                      background: `linear-gradient(135deg, ${customColors.p1} 0%, ${customColors.bg} 50%, ${customColors.p2} 100%)`,
                      border: `2px solid ${themeId === 'custom' ? customColors.p1 : 'transparent'}`,
                      color: '#ffffff',
                    }}
                  >
                    <div className="font-bold mb-2">🎨 {t('settings.customTheme')}</div>
                    <div className="flex gap-1 mb-2">
                      <span className="w-6 h-6 rounded" style={{ background: customColors.cellLight, border: `1px solid rgba(255,255,255,0.2)` }} />
                      <span className="w-6 h-6 rounded" style={{ background: customColors.cellDark, border: `1px solid rgba(255,255,255,0.2)` }} />
                      <span className="w-6 h-6 rounded" style={{ background: customColors.throne, border: `1px solid rgba(255,255,255,0.2)` }} />
                      <span className="w-6 h-6 rounded" style={{ background: customColors.bg, border: `1px solid rgba(255,255,255,0.2)` }} />
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="w-5 h-5 rounded-full" style={{ background: customColors.p1, border: `1px solid rgba(255,255,255,0.4)` }} />
                      <span className="w-5 h-5 rounded-full" style={{ background: customColors.p2, border: `1px solid rgba(255,255,255,0.4)` }} />
                      <span className="text-xs opacity-70">{themeId === 'custom' ? '✓' : ''}</span>
                    </div>
                  </button>
                </div>

                {/* Color pickers — only when Custom is the active theme */}
                {themeId === 'custom' && (
                  <div
                    className="rounded-xl p-3"
                    style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold opacity-85">🎨 {t('settings.customizeColors')}</div>
                      <button
                        onClick={resetCustomColors}
                        className="rounded-md px-2 py-1 text-xs"
                        style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textPrimary }}
                      >
                        ↺ {t('settings.resetCustom')}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        ['bg', t('settings.customBg')],
                        ['cellLight', t('settings.customCellLight')],
                        ['cellDark', t('settings.customCellDark')],
                        ['throne', t('settings.customThrone')],
                        ['p1', t('settings.customP1')],
                        ['p2', t('settings.customP2')],
                      ] as const).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 rounded-lg p-2"
                          style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}` }}
                        >
                          <input
                            type="color"
                            value={customColors[key]}
                            onChange={e => setCustomColor(key, e.target.value)}
                            className="rounded cursor-pointer"
                            style={{ width: 36, height: 36, padding: 0, border: 'none', background: 'transparent' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: theme.inputText }}>{label}</div>
                            <input
                              type="text"
                              value={customColors[key]}
                              onChange={e => setCustomColor(key, e.target.value)}
                              className="w-full text-xs rounded mt-1 px-1 py-0.5"
                              style={{ background: 'transparent', border: 'none', color: theme.inputText, outline: 'none' }}
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'language' && (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-sm font-semibold mb-2 opacity-80">{t('settings.activeLanguage')}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {locales.map(l => (
                      <button
                        key={l.id}
                        onClick={() => setLocaleId(l.id)}
                        className="rounded-lg p-2 text-sm flex items-center gap-2"
                        style={{
                          background: locale.id === l.id ? theme.buttonRotateBg : theme.buttonBg,
                          border: `1px solid ${locale.id === l.id ? theme.buttonRotateBorder : theme.buttonBorder}`,
                          color: locale.id === l.id ? theme.buttonRotateText : theme.textPrimary,
                        }}
                      >
                        <span className="text-xl">{l.flag}</span>
                        <span className="font-semibold flex-1 text-start">{l.name}</span>
                        {!isBuiltIn(l.id) && (
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); removeCustomLocale(l.id); }}
                            className="text-xs opacity-60 hover:opacity-100"
                            title={t('settings.remove')}
                          >
                            ✕
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl p-3" style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}>
                  <div className="text-sm font-semibold mb-2 opacity-80">{t('settings.addLanguage')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder={t('settings.langName')}
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="rounded-md px-2 py-1.5 text-sm col-span-2"
                      style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
                    />
                    <input
                      placeholder={t('settings.langId')}
                      value={newId}
                      onChange={e => setNewId(e.target.value.replace(/\s+/g, '').toLowerCase())}
                      className="rounded-md px-2 py-1.5 text-sm"
                      style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
                    />
                    <input
                      placeholder={t('settings.langFlag')}
                      value={newFlag}
                      onChange={e => setNewFlag(e.target.value)}
                      className="rounded-md px-2 py-1.5 text-sm"
                      style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
                    />
                    <select
                      value={newBase}
                      onChange={e => setNewBase(e.target.value)}
                      className="rounded-md px-2 py-1.5 text-sm"
                      style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
                    >
                      <option value="en" style={{ background: theme.inputBg, color: theme.inputText }}>{t('settings.langBase')}: English</option>
                      <option value="ar" style={{ background: theme.inputBg, color: theme.inputText }}>{t('settings.langBase')}: العربية</option>
                    </select>
                    <select
                      value={newDir}
                      onChange={e => setNewDir(e.target.value as 'ltr' | 'rtl')}
                      className="rounded-md px-2 py-1.5 text-sm"
                      style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
                    >
                      <option value="ltr" style={{ background: theme.inputBg, color: theme.inputText }}>LTR</option>
                      <option value="rtl" style={{ background: theme.inputBg, color: theme.inputText }}>RTL</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      if (!newId || !newName) return;
                      addCustomLocale(newId, newName, newFlag || '🏳️', newBase, newDir);
                      setNewId(''); setNewName(''); setNewFlag('🏳️');
                    }}
                    className="mt-2 w-full rounded-md px-3 py-1.5 text-sm font-semibold"
                    style={{ background: theme.buttonRotateBg, border: `1px solid ${theme.buttonRotateBorder}`, color: theme.buttonRotateText }}
                  >
                    + {t('settings.add')}
                  </button>
                </div>
              </div>
            )}

            {tab === 'translations' && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    value={editLocaleId}
                    onChange={e => setEditLocaleId(e.target.value)}
                    className="rounded-md px-2 py-1.5 text-sm"
                    style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
                  >
                    {locales.map(l => (
                      <option key={l.id} value={l.id} style={{ background: theme.inputBg, color: theme.inputText }}>
                        {l.flag} {l.name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder={t('settings.searchKeys')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-[150px] rounded-md px-2 py-1.5 text-sm"
                    style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
                  />
                </div>
                {isBuiltIn(editLocaleId) && (
                  <div className="text-xs opacity-60">{t('settings.builtInNotice')}</div>
                )}
                <div className="flex flex-col gap-2 mt-1">
                  {filteredKeys.map(key => {
                    const en = builtInLocale('en')?.strings[key] ?? '';
                    const current = t(key);
                    return (
                      <div key={key} className="rounded-lg p-2" style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}>
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <code className="text-xs opacity-70">{key}</code>
                          <button
                            onClick={() => resetTranslation(editLocaleId, key)}
                            className="text-xs opacity-60 hover:opacity-100"
                          >
                            ↺ {t('settings.resetKey')}
                          </button>
                        </div>
                        <div className="text-xs opacity-50 mb-1">EN: {en}</div>
                        <input
                          type="text"
                          value={current}
                          onChange={e => setTranslation(editLocaleId, key, e.target.value)}
                          className="w-full rounded-md px-2 py-1 text-sm"
                          style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
                          dir="auto"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
