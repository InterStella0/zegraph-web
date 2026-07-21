'use client';

import dayjs from 'dayjs';
import {useLocale} from 'next-intl';
import {useMemo} from 'react';

export default function useWeekdayLabels(): Record<string, string> {
    const locale = useLocale();
    return useMemo(() => {
        const map: Record<string, string> = {};
        const monday = dayjs().day(1);
        for (let i = 0; i < 7; i++) {
            const cur = monday.add(i, 'day');
            const key = cur.locale('en').format('ddd');
            map[key] = cur.format('ddd');
        }
        return map;
    }, [locale]);
}
