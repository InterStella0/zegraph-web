export const LOCALES = ['en', 'es', 'ms', 'zh-CN', 'zh-TW', 'ko', 'ja', 'ru', 'vi', 'id'] as const;
export type AppLocale = typeof LOCALES[number];

export const DEFAULT_LOCALE: AppLocale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

// Language names are always shown in their own language, never translated.
export const LOCALE_LABELS: Record<AppLocale, string> = {
    'en': 'English',
    'es': 'Español',
    'ms': 'Bahasa Melayu',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'ko': '한국어',
    'ja': '日本語',
    'ru': 'Русский',
    'vi': 'Tiếng Việt',
    'id': 'Bahasa Indonesia',
};

export function isAppLocale(value: string | undefined | null): value is AppLocale {
    return !!value && (LOCALES as readonly string[]).includes(value);
}
