'use client';

import {useLocale, useTranslations} from 'next-intl';
import {useCallback, useMemo} from 'react';
import {
    secondsToHours as secondsToHoursBase,
    formatNumber as formatNumberBase,
} from 'utils/generalUtils.ts';

// Locale-aware number/duration formatting for client components.
// Server components should use getLocale()/getTranslations() directly.
export default function useLocaleFormat() {
    const locale = useLocale();
    const t = useTranslations('common');

    const secondsToHours = useCallback(
        (seconds: number) => secondsToHoursBase(seconds, locale),
        [locale]
    );
    const formatHours = useCallback(
        (seconds: number) => t('hours', {value: secondsToHoursBase(seconds, locale)}),
        [locale, t]
    );
    const formatNumber = useCallback(
        (num: number, decimals = 0) => formatNumberBase(num, decimals, locale),
        [locale]
    );
    const formatOrdinal = useCallback(
        (n: number) => t('ordinal', {n}),
        [t]
    );

    return useMemo(
        () => ({locale, secondsToHours, formatHours, formatNumber, formatOrdinal}),
        [locale, secondsToHours, formatHours, formatNumber, formatOrdinal]
    );
}
