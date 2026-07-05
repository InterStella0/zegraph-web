'use client';

import dayjs from 'dayjs';
import 'dayjs/locale/es';
import 'dayjs/locale/ms';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';
import 'dayjs/locale/ru';
import 'dayjs/locale/vi';
import 'dayjs/locale/id';
import {useLocale} from 'next-intl';
import {ReactNode} from 'react';
import {AppLocale} from 'i18n/config';

const DAYJS_LOCALE: Record<AppLocale, string> = {
    'en': 'en',
    'es': 'es',
    'ms': 'ms',
    'zh-CN': 'zh-cn',
    'zh-TW': 'zh-tw',
    'ru': 'ru',
    'vi': 'vi',
    'id': 'id',
};

// Sets the dayjs global locale during render so children (SSR included) format
// dates in the active language. The global is module-wide: server components
// must not rely on it — use next-intl's getFormatter() or an explicit
// .locale() there instead.
export function DayjsLocaleProvider({children}: {children: ReactNode}) {
    const locale = useLocale();
    const mapped = DAYJS_LOCALE[locale as AppLocale] ?? 'en';
    if (dayjs.locale() !== mapped) dayjs.locale(mapped);
    return children;
}
