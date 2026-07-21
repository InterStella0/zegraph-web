'use server';

import {cookies} from 'next/headers';
import {LOCALE_COOKIE, isAppLocale} from 'i18n/config';

export async function setLocale(locale: string) {
    if (!isAppLocale(locale)) return;
    const store = await cookies();
    store.set(LOCALE_COOKIE, locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
    });
}
