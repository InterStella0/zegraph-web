import {cookies, headers} from 'next/headers';
import {getRequestConfig} from 'next-intl/server';
import {DEFAULT_LOCALE, LOCALE_COOKIE, isAppLocale, negotiateLocale} from './config';

type Messages = Record<string, unknown>;

function deepMerge(base: Messages, override: Messages): Messages {
    const result: Messages = {...base};
    for (const [key, value] of Object.entries(override)) {
        const baseValue = result[key];
        if (
            value && typeof value === 'object' && !Array.isArray(value) &&
            baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)
        ) {
            result[key] = deepMerge(baseValue as Messages, value as Messages);
        } else {
            result[key] = value;
        }
    }
    return result;
}

export default getRequestConfig(async () => {
    const store = await cookies();
    const candidate = store.get(LOCALE_COOKIE)?.value;
    const locale = isAppLocale(candidate)
        ? candidate
        : negotiateLocale((await headers()).get('accept-language')) ?? DEFAULT_LOCALE;

    const en = (await import('../messages/en.json')).default as Messages;
    const messages = locale === 'en'
        ? en
        : deepMerge(en, (await import(`../messages/${locale}.json`)).default as Messages);

    return {locale, messages};
});
