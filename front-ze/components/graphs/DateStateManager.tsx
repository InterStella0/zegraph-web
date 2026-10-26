'use client'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import dayjs, { Dayjs } from "lib/dayjs";
import {DateState, DateStateProvider} from "types/graphServers";

export enum DateSources {
    URL,
    TOOLBAR,
    ZOOM,
    EXTERNAL,
    LIVE
}

const LIVE_POLL_INTERVAL_MS = 150000;

const roundedNow = () => dayjs().startOf('minute');

const dateState = (start: Dayjs, end: Dayjs, source: DateSources): DateState =>
    ({ start, end, source, isLive: source === DateSources.LIVE, timestamp: dayjs() });

const getInitialDates = (): DateState => {
    const now = roundedNow();
    return { ...dateState(now.subtract(6, 'hours'), now, DateSources.URL), isLive: true };
};
const DateContext = createContext<DateStateProvider>({ ...getInitialDates(), setDates: () => {}, goLive: () => {} });

export function DateProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState(getInitialDates);

    const setDates = useCallback((start: Dayjs, end: Dayjs, source: DateSources) => {
        setState(dateState(start, end, source));
    }, []);

    const goLive = useCallback(() => setState(({ start, end }) => {
        const now = roundedNow();
        return dateState(now.subtract(end.diff(start), 'ms'), now, DateSources.LIVE);
    }), []);

    useEffect(() => {
        if (!state.isLive) return;

        const tick = () => {
            if (document.visibilityState === 'visible') goLive();
        };

        const intervalId = setInterval(tick, LIVE_POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', tick);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [state.isLive, goLive]);

    return (
        <DateContext.Provider value={{ ...state, setDates, goLive }}>
            {children}
        </DateContext.Provider>
    );
}

export const useDateState = () => useContext(DateContext);
