'use client'
import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import {DateState, DateStateProvider} from "types/graphServers";

export enum DateSources {
    URL,
    TOOLBAR,
    ZOOM,
    EXTERNAL,
    LIVE
}

const LIVE_POLL_INTERVAL_MS = 150000; // 2.5 minutes

const dateReducer = (state, action) => {
    switch (action.type) {
        case 'SET_DATES':
            return {
                ...state,
                start: action.start,
                end: action.end,
                source: action.source,
                isLive: action.source === DateSources.LIVE,
                timestamp: Date.now()
            };
        default:
            return state;
    }
};
const getInitialDates = () => {
    const now = dayjs();
    return {
        start: now.subtract(6, 'hours'),
        end: now,
        source: DateSources.URL,
        timestamp: dayjs(),
        isLive: true,
        setDates: () => {},
        goLive: () => {}
    };
};
const DateContext = createContext<DateStateProvider>(getInitialDates());

export function DateProvider({ children }) {
    const [dateState, dispatch] = useReducer(dateReducer, getInitialDates());
    const dateStateRef = useRef(dateState);

    useEffect(() => {
        dateStateRef.current = dateState;
    }, [dateState]);

    const setDates = useCallback((start: dayjs.Dayjs, end: dayjs.Dayjs, source: DateSources) => {
        dispatch({ type: 'SET_DATES', start, end, source });

        // Only update URL for non-zoom sources
        if (source !== DateSources.ZOOM) {
            // setSearchParams({
            //     start: start.toISOString(),
            //     end: end.toISOString()
            // });
        }
    }, [
        // setSearchParams
    ]);

    const goLive = useCallback(() => {
        const { start, end } = dateStateRef.current;
        const durationMs = end.diff(start);
        const now = dayjs();
        setDates(now.subtract(durationMs, 'ms'), now, DateSources.LIVE);
    }, [setDates]);

    useEffect(() => {
        if (!dateState.isLive) return;

        const tick = () => {
            if (document.visibilityState === 'visible') goLive();
        };

        const intervalId = setInterval(tick, LIVE_POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', tick);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [dateState.isLive, goLive]);

    const value = {
        ...dateState,
        setDates,
        goLive
    };
    return (
        <DateContext.Provider value={value}>
            {children}
        </DateContext.Provider>
    );
}

export const useDateState = () => {
    const context = useContext(DateContext);
    if (!context) {
        throw new Error('useDateState must be used within DateProvider');
    }
    return context;
};