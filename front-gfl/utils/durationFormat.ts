import humanizeDuration from 'humanize-duration';
import {AppLocale} from 'i18n/config';

// humanize-duration uses underscore-separated language codes.
const HUMANIZE_LOCALE: Record<AppLocale, string> = {
    'en': 'en',
    'es': 'es',
    'ms': 'ms',
    'zh-CN': 'zh_CN',
    'zh-TW': 'zh_TW',
};

export function humanizeDurationLocalized(
    ms: number,
    locale: string,
    options?: humanizeDuration.Options,
): string {
    const language = HUMANIZE_LOCALE[locale as AppLocale] ?? 'en';
    return humanizeDuration(ms, {language, fallbacks: ['en'], ...options});
}
