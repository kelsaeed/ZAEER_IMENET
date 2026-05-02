// Color themes for Zaeer Imenet. Each theme defines every visible color so
// switching themes recolors the whole game without touching component code.
//
// Contrast rules of thumb (so colorblind / low-vision users can play):
//   • cellLight is significantly lighter than cellDark (luminance gap ≥ 15).
//   • P1 vs P2 differ in BOTH hue AND luminance — never the same brightness.
//   • Throne / barrier stay clearly distinguishable from regular cells.

export interface Theme {
  id: string;
  name: string;
  // Page / chrome
  bgGradient: string;
  textPrimary: string;
  textMuted: string;
  // Board
  boardBorder: string;
  boardBg: string;
  cellLight: string;         // even cells (clearly brighter)
  cellDark: string;          // odd cells (clearly darker)
  // Special cells
  throneBg: string;
  throneBorder: string;
  throneGlow: string;
  barrierBg: string;
  barrierBorder: string;
  // Indicators
  validMoveFill: string;
  validMoveBorder: string;
  attackFill: string;
  attackBorder: string;
  // Players
  p1Color: string;
  p1Bg: string;
  p1BgSelected: string;
  p1Border: string;
  p1Glow: string;
  p1AccentBg: string;
  p1AccentBorder: string;
  p2Color: string;
  p2Bg: string;
  p2BgSelected: string;
  p2Border: string;
  p2Glow: string;
  p2AccentBg: string;
  p2AccentBorder: string;
  // HUD
  panelBg: string;
  panelBorder: string;
  inputBg: string;           // <input>/<select> readable bg (solid, not translucent)
  inputText: string;         // text inside <input>/<select>/<option>
  buttonBg: string;
  buttonBorder: string;
  buttonRotateBg: string;
  buttonRotateBorder: string;
  buttonRotateText: string;
  buttonEndTurnBg: string;
  buttonEndTurnBorder: string;
  buttonEndTurnText: string;
  buttonSwitchBg: string;
  buttonSwitchBorder: string;
  buttonSwitchText: string;
  selectedRing: string;
}

export const THEMES: Theme[] = [
  {
    id: 'navy',
    name: 'Royal Sapphire (Default)',
    bgGradient: 'radial-gradient(ellipse at top, #1a1f5c 0%, #0c0e2e 55%, #060818 100%)',
    textPrimary: '#f5f7ff',
    textMuted: 'rgba(245,247,255,0.7)',
    boardBorder: 'rgba(252,211,77,0.55)',           // warm gold frame
    boardBg: 'rgba(8,10,30,0.55)',
    cellLight: '#3b3f8a',                            // rich royal indigo
    cellDark: '#11142e',                             // deep midnight
    throneBg: '#d4a017',                             // antique gold throne
    throneBorder: 'rgba(253,224,71,0.95)',
    throneGlow: 'radial-gradient(ellipse at center, rgba(253,224,71,0.55) 0%, rgba(212,160,23,0.25) 35%, transparent 75%)',
    barrierBg: '#1a3a45',                            // teal-dark barrier
    barrierBorder: 'rgba(94,234,212,0.55)',
    validMoveFill: 'rgba(110,231,183,0.55)',         // mint-emerald (joyful)
    validMoveBorder: 'rgba(110,231,183,0.95)',
    attackFill: 'rgba(244,114,182,0.5)',             // pink-rose (warm + joyful)
    attackBorder: 'rgba(244,114,182,0.9)',
    p1Color: '#fcd34d',                              // bright warm gold
    p1Bg: 'rgba(252,211,77,0.24)',
    p1BgSelected: 'rgba(252,211,77,0.55)',
    p1Border: 'rgba(252,211,77,0.9)',
    p1Glow: '0 0 18px 6px rgba(252,211,77,0.7)',
    p1AccentBg: 'linear-gradient(135deg, rgba(252,211,77,0.4), rgba(212,160,23,0.1))',
    p1AccentBorder: 'rgba(252,211,77,0.65)',
    p2Color: '#a78bfa',                              // amethyst — royal jewel pair with gold
    p2Bg: 'rgba(167,139,250,0.24)',
    p2BgSelected: 'rgba(167,139,250,0.55)',
    p2Border: 'rgba(167,139,250,0.9)',
    p2Glow: '0 0 18px 6px rgba(167,139,250,0.7)',
    p2AccentBg: 'linear-gradient(135deg, rgba(167,139,250,0.4), rgba(91,33,182,0.1))',
    p2AccentBorder: 'rgba(167,139,250,0.65)',
    panelBg: 'linear-gradient(135deg, rgba(252,211,77,0.08), rgba(167,139,250,0.06))',
    panelBorder: 'rgba(252,211,77,0.25)',
    inputBg: '#161a3a',
    inputText: '#f5f7ff',
    buttonBg: 'rgba(255,255,255,0.07)',
    buttonBorder: 'rgba(255,255,255,0.2)',
    buttonRotateBg: 'rgba(252,211,77,0.3)',
    buttonRotateBorder: 'rgba(252,211,77,0.55)',
    buttonRotateText: '#fde68a',
    buttonEndTurnBg: 'rgba(244,114,182,0.28)',
    buttonEndTurnBorder: 'rgba(244,114,182,0.6)',
    buttonEndTurnText: '#fbcfe8',
    buttonSwitchBg: 'rgba(167,139,250,0.28)',
    buttonSwitchBorder: 'rgba(167,139,250,0.6)',
    buttonSwitchText: '#ddd6fe',
    selectedRing: '#facc15',
  },
  {
    id: 'aurora',
    name: 'Aurora Nights',
    bgGradient: 'radial-gradient(ellipse at top, #2d1a52 0%, #0e1a3a 50%, #050a1c 100%)',
    textPrimary: '#fdf4ff',
    textMuted: 'rgba(253,244,255,0.7)',
    boardBorder: 'rgba(192,132,252,0.55)',
    boardBg: 'rgba(20,10,50,0.55)',
    cellLight: '#3a2a72',                            // luminous violet
    cellDark: '#0e1030',                             // deep starlit blue
    throneBg: '#10b981',                             // emerald (aurora glow)
    throneBorder: 'rgba(110,231,183,0.95)',
    throneGlow: 'radial-gradient(ellipse at center, rgba(110,231,183,0.6) 0%, rgba(96,165,250,0.25) 40%, transparent 80%)',
    barrierBg: '#22063a',
    barrierBorder: 'rgba(192,132,252,0.6)',
    validMoveFill: 'rgba(165,243,252,0.55)',         // ice-cyan
    validMoveBorder: 'rgba(165,243,252,0.95)',
    attackFill: 'rgba(244,114,182,0.5)',
    attackBorder: 'rgba(244,114,182,0.9)',
    p1Color: '#f0abfc',                              // joyful pink-magenta
    p1Bg: 'rgba(240,171,252,0.24)',
    p1BgSelected: 'rgba(240,171,252,0.55)',
    p1Border: 'rgba(240,171,252,0.9)',
    p1Glow: '0 0 18px 6px rgba(240,171,252,0.7)',
    p1AccentBg: 'linear-gradient(135deg, rgba(240,171,252,0.4), rgba(168,85,247,0.1))',
    p1AccentBorder: 'rgba(240,171,252,0.65)',
    p2Color: '#34d399',                              // emerald-mint
    p2Bg: 'rgba(52,211,153,0.24)',
    p2BgSelected: 'rgba(52,211,153,0.55)',
    p2Border: 'rgba(52,211,153,0.9)',
    p2Glow: '0 0 18px 6px rgba(52,211,153,0.7)',
    p2AccentBg: 'linear-gradient(135deg, rgba(52,211,153,0.4), rgba(13,148,136,0.1))',
    p2AccentBorder: 'rgba(52,211,153,0.65)',
    panelBg: 'linear-gradient(135deg, rgba(240,171,252,0.08), rgba(52,211,153,0.06))',
    panelBorder: 'rgba(192,132,252,0.3)',
    inputBg: '#170a35',
    inputText: '#fdf4ff',
    buttonBg: 'rgba(192,132,252,0.1)',
    buttonBorder: 'rgba(192,132,252,0.3)',
    buttonRotateBg: 'rgba(240,171,252,0.28)',
    buttonRotateBorder: 'rgba(240,171,252,0.55)',
    buttonRotateText: '#fbcfe8',
    buttonEndTurnBg: 'rgba(244,114,182,0.28)',
    buttonEndTurnBorder: 'rgba(244,114,182,0.6)',
    buttonEndTurnText: '#fbcfe8',
    buttonSwitchBg: 'rgba(52,211,153,0.28)',
    buttonSwitchBorder: 'rgba(52,211,153,0.6)',
    buttonSwitchText: '#a7f3d0',
    selectedRing: '#f0abfc',
  },
  {
    id: 'mono',
    name: 'Black & White',
    bgGradient: 'linear-gradient(135deg, #000 0%, #181818 50%, #000 100%)',
    textPrimary: '#ffffff',
    textMuted: 'rgba(255,255,255,0.65)',
    boardBorder: 'rgba(255,255,255,0.5)',
    boardBg: 'rgba(0,0,0,0.5)',
    cellLight: '#3a3a3a',
    cellDark: '#0e0e0e',
    throneBg: '#5a5a5a',
    throneBorder: 'rgba(255,255,255,0.7)',
    throneGlow: 'radial-gradient(ellipse at center, rgba(255,255,255,0.3) 0%, transparent 70%)',
    barrierBg: '#1a1a1a',
    barrierBorder: 'rgba(255,255,255,0.45)',
    validMoveFill: 'rgba(255,255,255,0.4)',
    validMoveBorder: 'rgba(255,255,255,0.85)',
    attackFill: 'rgba(255,255,255,0.55)',
    attackBorder: 'rgba(255,255,255,0.95)',
    p1Color: '#ffffff',                 // bright white
    p1Bg: 'rgba(255,255,255,0.18)',
    p1BgSelected: 'rgba(255,255,255,0.42)',
    p1Border: 'rgba(255,255,255,0.85)',
    p1Glow: '0 0 14px 5px rgba(255,255,255,0.6)',
    p1AccentBg: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05))',
    p1AccentBorder: 'rgba(255,255,255,0.5)',
    p2Color: '#525252',                 // dark mid-grey (deep luminance gap from P1)
    p2Bg: 'rgba(82,82,82,0.35)',
    p2BgSelected: 'rgba(120,120,120,0.6)',
    p2Border: 'rgba(180,180,180,0.85)',
    p2Glow: '0 0 14px 5px rgba(180,180,180,0.55)',
    p2AccentBg: 'linear-gradient(135deg, rgba(82,82,82,0.5), rgba(82,82,82,0.1))',
    p2AccentBorder: 'rgba(180,180,180,0.55)',
    panelBg: 'rgba(255,255,255,0.06)',
    panelBorder: 'rgba(255,255,255,0.25)',
    inputBg: '#1a1a1a',
    inputText: '#ffffff',
    buttonBg: 'rgba(255,255,255,0.08)',
    buttonBorder: 'rgba(255,255,255,0.25)',
    buttonRotateBg: 'rgba(255,255,255,0.18)',
    buttonRotateBorder: 'rgba(255,255,255,0.45)',
    buttonRotateText: '#ffffff',
    buttonEndTurnBg: 'rgba(255,255,255,0.22)',
    buttonEndTurnBorder: 'rgba(255,255,255,0.55)',
    buttonEndTurnText: '#ffffff',
    buttonSwitchBg: 'rgba(255,255,255,0.14)',
    buttonSwitchBorder: 'rgba(255,255,255,0.4)',
    buttonSwitchText: '#ffffff',
    selectedRing: '#ffffff',
  },
  {
    id: 'olive',
    name: 'Olive Battlefield',
    bgGradient: 'linear-gradient(135deg, #1a1f0d 0%, #303818 50%, #1a1f0d 100%)',
    textPrimary: '#fafaf0',
    textMuted: 'rgba(250,250,240,0.65)',
    boardBorder: 'rgba(189,183,107,0.5)',
    boardBg: 'rgba(20,30,10,0.45)',
    cellLight: '#4a5a25',
    cellDark: '#1c2a08',
    throneBg: '#7a4a0d',
    throneBorder: 'rgba(252,211,77,0.7)',
    throneGlow: 'radial-gradient(ellipse at center, rgba(252,211,77,0.4) 0%, transparent 70%)',
    barrierBg: '#0a1a02',
    barrierBorder: 'rgba(132,170,60,0.65)',
    validMoveFill: 'rgba(190,255,80,0.45)',
    validMoveBorder: 'rgba(190,255,80,0.85)',
    attackFill: 'rgba(220,80,40,0.4)',
    attackBorder: 'rgba(220,80,40,0.8)',
    p1Color: '#fde047',                 // bright yellow
    p1Bg: 'rgba(253,224,71,0.22)',
    p1BgSelected: 'rgba(253,224,71,0.48)',
    p1Border: 'rgba(253,224,71,0.85)',
    p1Glow: '0 0 14px 5px rgba(253,224,71,0.7)',
    p1AccentBg: 'linear-gradient(135deg, rgba(253,224,71,0.35), rgba(253,224,71,0.1))',
    p1AccentBorder: 'rgba(253,224,71,0.6)',
    p2Color: '#1f3d0a',                 // very dark olive-green (huge lum gap)
    p2Bg: 'rgba(100,160,40,0.25)',
    p2BgSelected: 'rgba(120,180,50,0.55)',
    p2Border: 'rgba(140,200,80,0.85)',
    p2Glow: '0 0 14px 5px rgba(140,200,80,0.6)',
    p2AccentBg: 'linear-gradient(135deg, rgba(80,140,30,0.4), rgba(80,140,30,0.1))',
    p2AccentBorder: 'rgba(140,200,80,0.55)',
    panelBg: 'rgba(60,75,30,0.45)',
    panelBorder: 'rgba(189,183,107,0.3)',
    inputBg: '#262e15',
    inputText: '#fafaf0',
    buttonBg: 'rgba(189,183,107,0.13)',
    buttonBorder: 'rgba(189,183,107,0.35)',
    buttonRotateBg: 'rgba(253,224,71,0.28)',
    buttonRotateBorder: 'rgba(253,224,71,0.5)',
    buttonRotateText: '#fde68a',
    buttonEndTurnBg: 'rgba(220,80,40,0.25)',
    buttonEndTurnBorder: 'rgba(220,80,40,0.55)',
    buttonEndTurnText: '#fda4af',
    buttonSwitchBg: 'rgba(132,204,22,0.25)',
    buttonSwitchBorder: 'rgba(132,204,22,0.55)',
    buttonSwitchText: '#bef264',
    selectedRing: '#facc15',
  },
  {
    id: 'crimson',
    name: 'Crimson Empire',
    bgGradient: 'linear-gradient(135deg, #18020a 0%, #36050d 50%, #18020a 100%)',
    textPrimary: '#fff0f0',
    textMuted: 'rgba(255,240,240,0.65)',
    boardBorder: 'rgba(252,165,165,0.55)',
    boardBg: 'rgba(60,5,10,0.55)',
    cellLight: '#5a1212',                // clearly brighter red
    cellDark: '#1a0205',                 // near-black red (huge gap)
    throneBg: '#fbbf24',
    throneBorder: 'rgba(251,191,36,0.85)',
    throneGlow: 'radial-gradient(ellipse at center, rgba(251,191,36,0.55) 0%, transparent 70%)',
    barrierBg: '#0a0102',
    barrierBorder: 'rgba(248,113,113,0.7)',
    validMoveFill: 'rgba(252,211,77,0.45)',
    validMoveBorder: 'rgba(252,211,77,0.85)',
    attackFill: 'rgba(248,113,113,0.5)',
    attackBorder: 'rgba(248,113,113,0.9)',
    p1Color: '#fbbf24',                 // bright gold
    p1Bg: 'rgba(251,191,36,0.22)',
    p1BgSelected: 'rgba(251,191,36,0.5)',
    p1Border: 'rgba(251,191,36,0.85)',
    p1Glow: '0 0 14px 5px rgba(251,191,36,0.7)',
    p1AccentBg: 'linear-gradient(135deg, rgba(251,191,36,0.35), rgba(251,191,36,0.1))',
    p1AccentBorder: 'rgba(251,191,36,0.6)',
    p2Color: '#7c0a0a',                 // deep blood-red (very dark, distinct from cells)
    p2Bg: 'rgba(180,30,30,0.3)',
    p2BgSelected: 'rgba(220,40,40,0.55)',
    p2Border: 'rgba(248,113,113,0.85)',
    p2Glow: '0 0 14px 5px rgba(248,113,113,0.65)',
    p2AccentBg: 'linear-gradient(135deg, rgba(180,30,30,0.45), rgba(180,30,30,0.1))',
    p2AccentBorder: 'rgba(248,113,113,0.55)',
    panelBg: 'rgba(70,15,15,0.55)',
    panelBorder: 'rgba(248,113,113,0.3)',
    inputBg: '#2a0808',
    inputText: '#fff0f0',
    buttonBg: 'rgba(220,38,38,0.15)',
    buttonBorder: 'rgba(220,38,38,0.35)',
    buttonRotateBg: 'rgba(251,191,36,0.3)',
    buttonRotateBorder: 'rgba(251,191,36,0.55)',
    buttonRotateText: '#fde68a',
    buttonEndTurnBg: 'rgba(220,38,38,0.3)',
    buttonEndTurnBorder: 'rgba(220,38,38,0.6)',
    buttonEndTurnText: '#fecaca',
    buttonSwitchBg: 'rgba(252,165,165,0.25)',
    buttonSwitchBorder: 'rgba(252,165,165,0.55)',
    buttonSwitchText: '#fecaca',
    selectedRing: '#fbbf24',
  },
  {
    id: 'forest',
    name: 'Emerald Forest',
    bgGradient: 'linear-gradient(135deg, #02160d 0%, #053a25 50%, #02160d 100%)',
    textPrimary: '#ecfdf5',
    textMuted: 'rgba(236,253,245,0.65)',
    boardBorder: 'rgba(16,185,129,0.55)',
    boardBg: 'rgba(0,30,15,0.55)',
    cellLight: '#0e6b40',
    cellDark: '#021a0d',
    throneBg: '#a3340a',
    throneBorder: 'rgba(251,146,60,0.7)',
    throneGlow: 'radial-gradient(ellipse at center, rgba(251,146,60,0.45) 0%, transparent 70%)',
    barrierBg: '#011008',
    barrierBorder: 'rgba(34,197,94,0.6)',
    validMoveFill: 'rgba(132,225,150,0.55)',
    validMoveBorder: 'rgba(132,225,150,0.9)',
    attackFill: 'rgba(244,63,94,0.45)',
    attackBorder: 'rgba(244,63,94,0.85)',
    p1Color: '#fbbf24',                 // bright amber (warm + bright)
    p1Bg: 'rgba(251,191,36,0.22)',
    p1BgSelected: 'rgba(251,191,36,0.48)',
    p1Border: 'rgba(251,191,36,0.85)',
    p1Glow: '0 0 14px 5px rgba(251,191,36,0.7)',
    p1AccentBg: 'linear-gradient(135deg, rgba(251,191,36,0.35), rgba(251,191,36,0.1))',
    p1AccentBorder: 'rgba(251,191,36,0.6)',
    p2Color: '#0d9488',                 // saturated teal (cool + dark)
    p2Bg: 'rgba(13,148,136,0.28)',
    p2BgSelected: 'rgba(20,184,166,0.55)',
    p2Border: 'rgba(20,184,166,0.85)',
    p2Glow: '0 0 14px 5px rgba(20,184,166,0.65)',
    p2AccentBg: 'linear-gradient(135deg, rgba(13,148,136,0.4), rgba(13,148,136,0.1))',
    p2AccentBorder: 'rgba(20,184,166,0.55)',
    panelBg: 'rgba(15,55,30,0.5)',
    panelBorder: 'rgba(16,185,129,0.3)',
    inputBg: '#0e2a1c',
    inputText: '#ecfdf5',
    buttonBg: 'rgba(16,185,129,0.13)',
    buttonBorder: 'rgba(16,185,129,0.35)',
    buttonRotateBg: 'rgba(251,191,36,0.3)',
    buttonRotateBorder: 'rgba(251,191,36,0.55)',
    buttonRotateText: '#fde68a',
    buttonEndTurnBg: 'rgba(244,63,94,0.25)',
    buttonEndTurnBorder: 'rgba(244,63,94,0.55)',
    buttonEndTurnText: '#fda4af',
    buttonSwitchBg: 'rgba(125,211,252,0.22)',
    buttonSwitchBorder: 'rgba(125,211,252,0.5)',
    buttonSwitchText: '#bae6fd',
    selectedRing: '#fbbf24',
  },
  {
    id: 'royal',
    name: 'Royal Purple',
    bgGradient: 'linear-gradient(135deg, #14091f 0%, #2c1845 50%, #14091f 100%)',
    textPrimary: '#f5f3ff',
    textMuted: 'rgba(245,243,255,0.65)',
    boardBorder: 'rgba(168,85,247,0.55)',
    boardBg: 'rgba(20,9,40,0.55)',
    cellLight: '#3d2065',
    cellDark: '#100620',
    throneBg: '#5b21b6',
    throneBorder: 'rgba(216,180,254,0.7)',
    throneGlow: 'radial-gradient(ellipse at center, rgba(216,180,254,0.45) 0%, transparent 70%)',
    barrierBg: '#070114',
    barrierBorder: 'rgba(168,85,247,0.6)',
    validMoveFill: 'rgba(216,180,254,0.5)',
    validMoveBorder: 'rgba(216,180,254,0.85)',
    attackFill: 'rgba(244,114,182,0.45)',
    attackBorder: 'rgba(244,114,182,0.85)',
    p1Color: '#fbbf24',                 // bright amber (warm)
    p1Bg: 'rgba(251,191,36,0.22)',
    p1BgSelected: 'rgba(251,191,36,0.48)',
    p1Border: 'rgba(251,191,36,0.85)',
    p1Glow: '0 0 14px 5px rgba(251,191,36,0.7)',
    p1AccentBg: 'linear-gradient(135deg, rgba(251,191,36,0.35), rgba(251,191,36,0.1))',
    p1AccentBorder: 'rgba(251,191,36,0.6)',
    p2Color: '#a855f7',                 // saturated purple (cool, deeper)
    p2Bg: 'rgba(168,85,247,0.28)',
    p2BgSelected: 'rgba(192,132,252,0.55)',
    p2Border: 'rgba(192,132,252,0.85)',
    p2Glow: '0 0 14px 5px rgba(192,132,252,0.65)',
    p2AccentBg: 'linear-gradient(135deg, rgba(168,85,247,0.4), rgba(168,85,247,0.1))',
    p2AccentBorder: 'rgba(192,132,252,0.55)',
    panelBg: 'rgba(40,20,60,0.5)',
    panelBorder: 'rgba(168,85,247,0.3)',
    inputBg: '#1d0f33',
    inputText: '#f5f3ff',
    buttonBg: 'rgba(168,85,247,0.13)',
    buttonBorder: 'rgba(168,85,247,0.35)',
    buttonRotateBg: 'rgba(251,191,36,0.3)',
    buttonRotateBorder: 'rgba(251,191,36,0.55)',
    buttonRotateText: '#fde68a',
    buttonEndTurnBg: 'rgba(244,114,182,0.25)',
    buttonEndTurnBorder: 'rgba(244,114,182,0.55)',
    buttonEndTurnText: '#f9a8d4',
    buttonSwitchBg: 'rgba(216,180,254,0.22)',
    buttonSwitchBorder: 'rgba(216,180,254,0.5)',
    buttonSwitchText: '#e9d5ff',
    selectedRing: '#fbbf24',
  },
];

export const DEFAULT_THEME_ID = 'navy';

// ─── Custom Theme Builder ────────────────────────────────────────────────────
//
// The user picks 6 primary colors from the Settings panel. From those we
// derive the 40+ fields a full Theme requires using simple color math, so
// the user never has to edit translucent rgba strings or remember which
// border goes with which background.

export interface CustomThemeColors {
  bg: string;           // page background base (deepest tone)
  cellLight: string;    // brighter checkerboard square
  cellDark: string;     // darker checkerboard square
  throne: string;       // throne cell colour
  p1: string;           // player 1 primary colour
  p2: string;           // player 2 primary colour
}

export const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  bg:        '#0c0e2e',
  cellLight: '#3b3f8a',
  cellDark:  '#11142e',
  throne:    '#d4a017',
  p1:        '#fcd34d',
  p2:        '#a78bfa',
};

/** mix colour `c` with `over` at `pct%`. Output is a string the browser parses. */
function mix(c: string, over: string, pct: number): string {
  return `color-mix(in srgb, ${over} ${pct}%, ${c})`;
}
function withAlpha(c: string, a: number): string {
  return `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;
}

/** Build a complete Theme object from 6 user-chosen colours. */
export function buildCustomTheme(c: CustomThemeColors): Theme {
  return {
    id: 'custom',
    name: 'Custom',
    bgGradient: `radial-gradient(ellipse at top, ${mix(c.bg, 'white', 12)} 0%, ${c.bg} 55%, ${mix(c.bg, 'black', 35)} 100%)`,
    textPrimary: '#f5f7ff',
    textMuted: 'rgba(245,247,255,0.7)',
    boardBorder: withAlpha(c.throne, 0.55),
    boardBg: withAlpha(c.bg, 0.55),
    cellLight: c.cellLight,
    cellDark: c.cellDark,
    throneBg: c.throne,
    throneBorder: withAlpha(mix(c.throne, 'white', 30), 0.95),
    throneGlow: `radial-gradient(ellipse at center, ${withAlpha(c.throne, 0.55)} 0%, ${withAlpha(c.throne, 0.25)} 35%, transparent 75%)`,
    barrierBg: mix(c.bg, 'black', 30),
    barrierBorder: withAlpha(mix(c.bg, 'white', 35), 0.55),
    validMoveFill: withAlpha('#6ee7b7', 0.55),
    validMoveBorder: withAlpha('#6ee7b7', 0.95),
    attackFill: withAlpha('#f472b6', 0.5),
    attackBorder: withAlpha('#f472b6', 0.9),
    p1Color: c.p1,
    p1Bg: withAlpha(c.p1, 0.24),
    p1BgSelected: withAlpha(c.p1, 0.55),
    p1Border: withAlpha(c.p1, 0.9),
    p1Glow: `0 0 18px 6px ${withAlpha(c.p1, 0.7)}`,
    p1AccentBg: `linear-gradient(135deg, ${withAlpha(c.p1, 0.4)}, ${withAlpha(c.p1, 0.1)})`,
    p1AccentBorder: withAlpha(c.p1, 0.65),
    p2Color: c.p2,
    p2Bg: withAlpha(c.p2, 0.24),
    p2BgSelected: withAlpha(c.p2, 0.55),
    p2Border: withAlpha(c.p2, 0.9),
    p2Glow: `0 0 18px 6px ${withAlpha(c.p2, 0.7)}`,
    p2AccentBg: `linear-gradient(135deg, ${withAlpha(c.p2, 0.4)}, ${withAlpha(c.p2, 0.1)})`,
    p2AccentBorder: withAlpha(c.p2, 0.65),
    panelBg: `linear-gradient(135deg, ${withAlpha(c.p1, 0.08)}, ${withAlpha(c.p2, 0.06)})`,
    panelBorder: withAlpha(c.p1, 0.25),
    inputBg: mix(c.bg, 'white', 8),
    inputText: '#f5f7ff',
    buttonBg: 'rgba(255,255,255,0.07)',
    buttonBorder: 'rgba(255,255,255,0.2)',
    buttonRotateBg: withAlpha(c.p1, 0.3),
    buttonRotateBorder: withAlpha(c.p1, 0.55),
    buttonRotateText: mix(c.p1, 'white', 30),
    buttonEndTurnBg: 'rgba(244,114,182,0.28)',
    buttonEndTurnBorder: 'rgba(244,114,182,0.6)',
    buttonEndTurnText: '#fbcfe8',
    buttonSwitchBg: withAlpha(c.p2, 0.28),
    buttonSwitchBorder: withAlpha(c.p2, 0.6),
    buttonSwitchText: mix(c.p2, 'white', 30),
    selectedRing: c.p1,
  };
}
