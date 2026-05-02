// Built-in locales for Zaeer Imenet. Custom languages are appended at runtime
// via the Settings panel and stored in localStorage.

export interface Locale {
  id: string;
  name: string;
  flag: string;             // emoji flag
  dir: 'ltr' | 'rtl';
  strings: Record<string, string>;
}

const en: Record<string, string> = {
  // App
  'app.title': 'Zaeer Imenet',
  'app.subtitle': 'The Ancient Strategy Game',
  'app.boardSummary': '16×16 Board · 2 Players · Round-based',
  'app.startButton': '⚔️ Start Game ⚔️',

  // Win conditions
  'win.title': 'Win Conditions',
  'win.lionThrone': 'Move your Lion to the central red Throne (4×4 area)',
  'win.killLions': 'Eliminate both enemy Lions',

  // Pieces
  'piece.lion': 'Lion',
  'piece.elephant': 'Elephant',
  'piece.ant': 'Ant',
  'piece.butterfly': 'Butterfly',
  'piece.bat': 'Bat',
  'piece.monkey': 'Monkey',

  // Piece descriptions
  'desc.lion': 'Moves 1 step cardinal. Kills ANY. Wins by reaching the throne.',
  'desc.elephant': 'Slides cardinal freely. 2 HP. Kills Lion. Cooldown after attack.',
  'desc.monkey': 'Moves up to 4 steps any direction. Jumps over pieces & barriers. Kills Bat.',
  'desc.bat': 'Slides diagonal. Paralyzes enemies by stacking on them. Kills Butterfly.',
  'desc.butterfly': 'Slides diagonal. Shields allies by stacking on them. Kills Ant.',
  'desc.ant': 'Occupies 3 squares. Moves up to 4 cardinal steps. Can rotate. Kills Elephant.',

  // Board legend
  'legend.throne': 'Throne (goal)',
  'legend.barrier': 'Barrier (wall)',
  'legend.validMove': 'Valid move',

  // HUD
  'hud.playerTurn': "Player {n}'s Turn",
  'hud.turnCounter': 'Turn #{n}',
  'hud.player1Pieces': "Player 1 Pieces ({n})",
  'hud.player2Pieces': "Player 2 Pieces ({n})",
  'hud.selected': 'Selected',
  'hud.position': 'Player {n} · {sq}',
  'hud.brokenHeart': '💔 Broken Heart (1 HP left)',
  'hud.paralyzed': '💜 Paralyzed — cannot move',
  'hud.shieldedBy': '🛡 Shielded by Butterfly',
  'hud.cooldown': '⏳ Cooldown — can move, cannot attack',
  'hud.orientation': 'Orientation: {o}',
  'hud.rotateTo': 'Rotate to (valid only):',
  'hud.noValidRotation': 'No valid rotation',
  'hud.endTurn': '✓ End Turn',
  'hud.moveButterflyAlone': '🦋 Move Butterfly alone (leave {name})',
  'hud.moveShielded': '🛡 Move Shielded {name} (both move together)',
  'hud.killCycle': 'Kill Cycle',
  'hud.killCycleNote': '🐘 2 HP (incl. vs 🦁) · 🦇 paralyzes · 🦋 shields',
  'hud.killCycleAll': '· 🦁 kills all',
  'hud.reset': '🔁 Reset Game',
  'hud.mainMenu': '🏠 Main Menu',
  'hud.restartMatch': '🔁 Restart Match',
  'hud.settings': '⚙️',

  // Orientation labels
  'orientation.horizontal': 'Horizontal',
  'orientation.vertical': 'Vertical',
  'orientation.diagonal': 'Diagonal',
  'orientation.antidiagonal': 'Antidiagonal',

  // Action messages
  'action.gameReady': 'Game ready — Player 1 starts!',
  'action.player1Turn': "Player 1's turn!",
  'action.butterflyShields': '🦋 Butterfly shields the {name}!',
  'action.elephantDamaged': '💔 Elephant damaged! (Broken Heart — 1 HP left)',
  'action.paralyzedElephantDamaged': '💔 Paralyzed Elephant damaged! (Broken Heart — 1 HP left)',
  'action.batParalyzes': '🦇 Bat paralyzes the {name}!',
  'action.batKillsButterfly': '🦇 Bat kills butterfly and paralyzes the {name}!',
  'action.eliminated': '💀 {target} eliminated by {attacker}!',
  'action.lionWinsThrone': '👑 PLAYER {n} WINS! The Lion claims the Throne!',
  'action.lionWinsKill': '👑 PLAYER {n} WINS! Both enemy Lions eliminated!',
  'action.turnEnded': '🔄 Turn ended.',
  'action.antRotated': '🔄 Ant rotated (turn used)',

  // Win screen
  'win.victory': 'VICTORY!',
  'win.playerWins': 'Player {n} Wins!',
  'win.goldenLion': '⚔️ The Golden Lion claims the Throne!',
  'win.silverLion': '🛡️ The Silver Lion claims the Throne!',
  'win.playAgain': '🔄 Play Again',
  'win.mainMenu': '🏠 Main Menu',

  // Settings panel
  'settings.title': 'Settings',
  'settings.theme': 'Theme',
  'settings.language': 'Language',
  'settings.activeLanguage': 'Active language',
  'settings.addLanguage': 'Add new language',
  'settings.langName': 'Name (e.g. Français)',
  'settings.langFlag': 'Flag emoji (e.g. 🇫🇷)',
  'settings.langId': 'Code (e.g. fr)',
  'settings.langBase': 'Copy strings from',
  'settings.langDir': 'Direction',
  'settings.add': 'Add',
  'settings.remove': 'Remove',
  'settings.editTranslations': 'Edit translations',
  'settings.searchKeys': 'Search keys…',
  'settings.builtInNotice': 'Built-in language — overrides applied on top of defaults',
  'settings.resetKey': 'Reset',
  'settings.close': 'Close',
  'settings.customTheme': 'Custom Theme',
  'settings.customizeColors': 'Pick your colors',
  'settings.resetCustom': 'Reset',
  'settings.customBg': 'Background',
  'settings.customCellLight': 'Light cells',
  'settings.customCellDark': 'Dark cells',
  'settings.customThrone': 'Throne',
  'settings.customP1': 'Player 1',
  'settings.customP2': 'Player 2',

  // Auth
  'auth.signIn': 'Sign in',
  'auth.signOut': 'Sign out',
  'auth.signUp': 'Create account',
  'auth.signInTitle': 'Welcome back',
  'auth.signInSubtitle': 'Sign in to play online and save your progress.',
  'auth.signUpTitle': 'Create your account',
  'auth.signUpSubtitle': 'Pick a name, set a password, and you can start playing.',
  'auth.continueWithGoogle': 'Continue with Google',
  'auth.or': 'or',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.passwordPlaceholder': 'Password (10+ characters)',
  'auth.displayName': 'Display name',
  'auth.usernamePlaceholder': 'Username (letters, digits, underscore)',
  'auth.usernameRule': 'Username must be 3–20 letters / digits / underscore.',
  'auth.passwordRule': 'Password must be at least 10 characters.',
  'auth.forgotPassword': 'Forgot password?',
  'auth.createAccount': 'Create an account →',
  'auth.haveAccount': 'Already have an account? Sign in',
  'auth.checkEmailTitle': 'Check your inbox',
  'auth.checkEmailBody': 'We sent a verification link to {email}. Click it to activate your account.',
  'auth.goToLogin': 'Back to sign in',
  'auth.signUpDisclaimer': 'By creating an account you agree to play fair and respect other players.',
  'auth.backHome': 'Back to game',
  'auth.profile': 'Profile',
  'auth.admin': 'Admin',
};

const ar: Record<string, string> = {
  'app.title': 'زائر إيمنت',
  'app.subtitle': 'لعبة الاستراتيجية القديمة',
  'app.boardSummary': 'لوحة 16×16 · لاعبان · بالأدوار',
  'app.startButton': '⚔️ ابدأ اللعبة ⚔️',

  'win.title': 'شروط الفوز',
  'win.lionThrone': 'حرّك الأسد إلى العرش الأحمر في المنتصف (منطقة 4×4)',
  'win.killLions': 'اقضِ على أسدَي الخصم',

  'piece.lion': 'الأسد',
  'piece.elephant': 'الفيل',
  'piece.ant': 'النملة',
  'piece.butterfly': 'الفراشة',
  'piece.bat': 'الخفاش',
  'piece.monkey': 'القرد',

  'desc.lion': 'يتحرك خطوة واحدة في الاتجاهات الأربعة. يقتل أي قطعة. يفوز بالوصول إلى العرش.',
  'desc.elephant': 'ينزلق في الاتجاهات الأربعة. نقطتا حياة. يقتل الأسد. يخضع لـ cooldown بعد الهجوم.',
  'desc.monkey': 'يتحرك حتى 4 خطوات في أي اتجاه. يقفز فوق القطع والحواجز. يقتل الخفاش.',
  'desc.bat': 'ينزلق قطرياً. يشلّ الأعداء بالوقوف فوقهم. يقتل الفراشة.',
  'desc.butterfly': 'تنزلق قطرياً. تحمي الحلفاء بالوقوف فوقهم. تقتل النملة.',
  'desc.ant': 'تحتل 3 مربعات. تتحرك حتى 4 خطوات. يمكنها الدوران. تقتل الفيل.',

  'legend.throne': 'العرش (الهدف)',
  'legend.barrier': 'الحاجز',
  'legend.validMove': 'حركة متاحة',

  'hud.playerTurn': 'دور اللاعب {n}',
  'hud.turnCounter': 'الدور #{n}',
  'hud.player1Pieces': 'قطع اللاعب 1 ({n})',
  'hud.player2Pieces': 'قطع اللاعب 2 ({n})',
  'hud.selected': 'المختارة',
  'hud.position': 'لاعب {n} · {sq}',
  'hud.brokenHeart': '💔 قلب مكسور (نقطة حياة واحدة)',
  'hud.paralyzed': '💜 مشلولة — لا يمكنها التحرك',
  'hud.shieldedBy': '🛡 محمية بالفراشة',
  'hud.cooldown': '⏳ Cooldown — يمكنه التحرك ولا يمكنه الهجوم',
  'hud.orientation': 'الاتجاه: {o}',
  'hud.rotateTo': 'الدوران إلى (المتاح فقط):',
  'hud.noValidRotation': 'لا يوجد دوران ممكن',
  'hud.endTurn': '✓ إنهاء الدور',
  'hud.moveButterflyAlone': '🦋 تحريك الفراشة وحدها (ترك {name})',
  'hud.moveShielded': '🛡 تحريك {name} المحمية (يتحركان معاً)',
  'hud.killCycle': 'دورة القتل',
  'hud.killCycleNote': '🐘 نقطتا حياة (ضد 🦁 أيضاً) · 🦇 يشلّ · 🦋 تحمي',
  'hud.killCycleAll': '· 🦁 يقتل الجميع',
  'hud.reset': '🔁 إعادة اللعبة',
  'hud.mainMenu': '🏠 القائمة الرئيسية',
  'hud.restartMatch': '🔁 مباراة جديدة',
  'hud.settings': '⚙️',

  'orientation.horizontal': 'أفقي',
  'orientation.vertical': 'عمودي',
  'orientation.diagonal': 'قطري',
  'orientation.antidiagonal': 'قطري معاكس',

  'action.gameReady': 'اللعبة جاهزة — اللاعب 1 يبدأ!',
  'action.player1Turn': 'دور اللاعب 1!',
  'action.butterflyShields': '🦋 الفراشة تحمي {name}!',
  'action.elephantDamaged': '💔 إصابة الفيل! (قلب مكسور — نقطة حياة واحدة)',
  'action.paralyzedElephantDamaged': '💔 إصابة الفيل المشلول! (قلب مكسور — نقطة حياة واحدة)',
  'action.batParalyzes': '🦇 الخفاش يشلّ {name}!',
  'action.batKillsButterfly': '🦇 الخفاش يقتل الفراشة ويشلّ {name}!',
  'action.eliminated': '💀 تمّ القضاء على {target} بواسطة {attacker}!',
  'action.lionWinsThrone': '👑 اللاعب {n} يفوز! الأسد يستولي على العرش!',
  'action.lionWinsKill': '👑 اللاعب {n} يفوز! تمّ القضاء على أسدَي الخصم!',
  'action.turnEnded': '🔄 انتهى الدور.',
  'action.antRotated': '🔄 دارت النملة (تمّ استخدام الدور)',

  'win.victory': 'فوز!',
  'win.playerWins': 'اللاعب {n} فاز!',
  'win.goldenLion': '⚔️ الأسد الذهبي يستولي على العرش!',
  'win.silverLion': '🛡️ الأسد الفضي يستولي على العرش!',
  'win.playAgain': '🔄 العب مجدداً',
  'win.mainMenu': '🏠 القائمة الرئيسية',

  'settings.title': 'الإعدادات',
  'settings.theme': 'المظهر',
  'settings.language': 'اللغة',
  'settings.activeLanguage': 'اللغة النشطة',
  'settings.addLanguage': 'إضافة لغة جديدة',
  'settings.langName': 'الاسم (مثلاً Français)',
  'settings.langFlag': 'علم emoji (مثلاً 🇫🇷)',
  'settings.langId': 'الكود (مثلاً fr)',
  'settings.langBase': 'نسخ النصوص من',
  'settings.langDir': 'الاتجاه',
  'settings.add': 'إضافة',
  'settings.remove': 'حذف',
  'settings.editTranslations': 'تعديل الترجمات',
  'settings.searchKeys': 'بحث في المفاتيح…',
  'settings.builtInNotice': 'لغة مدمجة — التعديلات تُطبَّق فوق القيم الأصلية',
  'settings.resetKey': 'استعادة',
  'settings.close': 'إغلاق',
  'settings.customTheme': 'مظهر مخصص',
  'settings.customizeColors': 'اختر ألوانك',
  'settings.resetCustom': 'استعادة',
  'settings.customBg': 'الخلفية',
  'settings.customCellLight': 'المربعات الفاتحة',
  'settings.customCellDark': 'المربعات الداكنة',
  'settings.customThrone': 'العرش',
  'settings.customP1': 'اللاعب 1',
  'settings.customP2': 'اللاعب 2',

  // Auth
  'auth.signIn': 'تسجيل الدخول',
  'auth.signOut': 'تسجيل الخروج',
  'auth.signUp': 'إنشاء حساب',
  'auth.signInTitle': 'أهلاً بعودتك',
  'auth.signInSubtitle': 'سجّل الدخول للعب أونلاين وحفظ تقدّمك.',
  'auth.signUpTitle': 'أنشئ حسابك',
  'auth.signUpSubtitle': 'اختر اسماً وكلمة سرّ وابدأ اللعب.',
  'auth.continueWithGoogle': 'المتابعة بحساب Google',
  'auth.or': 'أو',
  'auth.email': 'البريد الإلكتروني',
  'auth.password': 'كلمة السر',
  'auth.passwordPlaceholder': 'كلمة السر (10 أحرف على الأقل)',
  'auth.displayName': 'الاسم الظاهر',
  'auth.usernamePlaceholder': 'اسم المستخدم (حروف/أرقام/شرطة سفلية)',
  'auth.usernameRule': 'اسم المستخدم لازم 3–20 حرف/رقم/شرطة سفلية.',
  'auth.passwordRule': 'كلمة السر لازم 10 أحرف على الأقل.',
  'auth.forgotPassword': 'نسيت كلمة السر؟',
  'auth.createAccount': 'إنشاء حساب جديد →',
  'auth.haveAccount': 'عندك حساب بالفعل؟ سجّل الدخول',
  'auth.checkEmailTitle': 'افحص بريدك',
  'auth.checkEmailBody': 'بعتنالك رابط تفعيل على {email}. اضغطه لتفعيل حسابك.',
  'auth.goToLogin': 'الرجوع لتسجيل الدخول',
  'auth.signUpDisclaimer': 'بإنشاء حساب توافق على اللعب باحترام واحترام اللاعبين الآخرين.',
  'auth.backHome': 'الرجوع للعبة',
  'auth.profile': 'الملف الشخصي',
  'auth.admin': 'مدير',
};

export const LOCALES: Locale[] = [
  { id: 'en', name: 'English', flag: '🇬🇧', dir: 'ltr', strings: en },
  { id: 'ar', name: 'العربية', flag: '🇸🇦', dir: 'rtl', strings: ar },
];

export const DEFAULT_LOCALE_ID = 'en';

export function builtInLocale(id: string): Locale | undefined {
  return LOCALES.find(l => l.id === id);
}

export function builtInLocaleIds(): string[] {
  return LOCALES.map(l => l.id);
}

/** Replace `{name}` placeholders in a translated string. */
export function format(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}
