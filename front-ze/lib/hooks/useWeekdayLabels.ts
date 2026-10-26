'use client';

import dayjs from 'lib/dayjs';
import {useLocale} from 'next-intl';
import {useMemo} from 'react';

/** Localised short weekday names keyed by their English abbreviation (Mon…Sun). */
export default function useWeekdayLabels(): Record<string, string> {
    const locale = useLocale();
    return useMemo(() => {
        const monday = dayjs().day(1);
        return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => {
            const day = monday.add(i, 'day');
            return [day.locale('en').format('ddd'), day.format('ddd')];
        }));
    }, [locale]);
}
