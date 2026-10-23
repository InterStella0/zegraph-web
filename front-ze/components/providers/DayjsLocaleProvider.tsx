'use client';

import dayjs from "dayjs"; // core only: this renders in the root layout, so it skips lib/dayjs's plugins
import 'dayjs/locale/es';
import 'dayjs/locale/ms';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';
import 'dayjs/locale/ru';
import 'dayjs/locale/vi';
import 'dayjs/locale/id';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import {useLocale} from 'next-intl';
import {ReactNode} from 'react';
import {isAppLocale} from 'i18n/config';

export function DayjsLocaleProvider({children}: {children: ReactNode}) {
    const locale = useLocale();
    // dayjs locale ids are the lower-cased app locales (zh-CN -> zh-cn); each needs its import above.
    const mapped = isAppLocale(locale) ? locale.toLowerCase() : 'en';
    if (dayjs.locale() !== mapped) dayjs.locale(mapped);
    return children;
}
