export const LOCALES = ['en', 'es', 'ms', 'zh-CN', 'zh-TW', 'ko', 'ja', 'ru', 'vi', 'id'] as const;
export type AppLocale = typeof LOCALES[number];

export const DEFAULT_LOCALE: AppLocale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

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

const TRADITIONAL_CHINESE = /^zh-(tw|hk|mo|hant)\b/;

function matchLocale(tag: string): AppLocale | null {
    const lower = tag.toLowerCase();
    const exact = LOCALES.find(locale => locale.toLowerCase() === lower);
    if (exact) return exact;
    if (lower.startsWith('zh')) return TRADITIONAL_CHINESE.test(lower) ? 'zh-TW' : 'zh-CN';
    const primary = lower.split('-')[0];
    return LOCALES.find(locale => locale === primary) ?? null;
}

// Picks the visitor's most preferred supported language from an Accept-Language header.
// Serving it up front keeps browsers from machine-translating the page, which rewrites
// text nodes before hydration and makes React throw a hydration mismatch (#418).
export function negotiateLocale(acceptLanguage: string | null | undefined): AppLocale | null {
    if (!acceptLanguage) return null;
    const ranked = acceptLanguage
        .split(',')
        .map(part => {
            const [tag, ...params] = part.trim().split(';');
            const q = params.find(p => p.trim().startsWith('q='));
            return {tag: tag.trim(), q: q ? Number(q.trim().slice(2)) : 1};
        })
        .filter(({tag, q}) => tag && tag !== '*' && q > 0)
        .sort((a, b) => b.q - a.q);
    for (const {tag} of ranked) {
        const locale = matchLocale(tag);
        if (locale) return locale;
    }
    return null;
}
