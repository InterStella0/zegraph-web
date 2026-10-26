'use client'
import {useEffect, useReducer, useState, useSyncExternalStore} from "react";
import {fetchUrl, URI} from "utils/generalUtils.ts";
import {LiveEvent, mergeEvents, parseLiveEvent, RawLiveEvent} from "./liveEvents";

export type LiveConnection = 'connecting' | 'live' | 'reconnecting';

type FeedState = {
    events: LiveEvent[],
    /** Streamed while paused, held back until resume. */
    queued: LiveEvent[],
    paused: boolean,
};

type FeedAction =
    | { type: 'received', event: LiveEvent }
    | { type: 'history', events: LiveEvent[], openedAt: number }
    | { type: 'pause' }
    | { type: 'resume' };

const isStreamedSince = (event: LiveEvent, since: number) => event.arrivedAt !== null && event.arrivedAt >= since;

function feedReducer(state: FeedState, action: FeedAction): FeedState {
    switch (action.type) {
        case 'received':
            return state.paused
                ? { ...state, queued: mergeEvents([action.event], state.queued) }
                : { ...state, events: mergeEvents([action.event], state.events) };
        case 'history': {
            // History is fetched on every (re)connect, so it also backfills whatever was missed while down.
            // Anything streamed since that connection opened is newer than all of it.
            const newer = state.events.filter(event => isStreamedSince(event, action.openedAt));
            const older = state.events.filter(event => !isStreamedSince(event, action.openedAt));
            return { ...state, events: mergeEvents(newer, action.events, older) };
        }
        case 'pause':
            return { ...state, paused: true };
        case 'resume':
            return { events: mergeEvents(state.queued, state.events), queued: [], paused: false };
    }
}

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 60000;

export function useLiveEvents() {
    const [feed, dispatch] = useReducer(feedReducer, { events: [], queued: [], paused: false });
    const [connection, setConnection] = useState<LiveConnection>('connecting');
    const [connectedAt, setConnectedAt] = useState<number | null>(null);

    useEffect(() => {
        let source: EventSource | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;

        const connect = () => {
            const current = new EventSource(URI('/events/data-updates'));
            source = current;

            current.onopen = () => {
                const openedAt = Date.now();
                attempt = 0;
                setConnection('live');
                setConnectedAt(openedAt);
                fetchUrl('/events/history')
                    .then((history: RawLiveEvent[]) => {
                        if (source !== current) return;
                        const events = history.map(raw => parseLiveEvent(raw, null)).filter((event): event is LiveEvent => event !== null);
                        dispatch({ type: 'history', events, openedAt });
                    })
                    .catch(error => console.error('Failed to load live event history:', error));
            };

            current.onmessage = (message) => {
                const raw: RawLiveEvent = JSON.parse(message.data);
                if (raw.channel === 'heartbeat') return;
                const event = parseLiveEvent(raw, Date.now());
                if (event) dispatch({ type: 'received', event });
            };

            current.onerror = () => {
                current.close();
                source = null;
                setConnection('reconnecting');
                setConnectedAt(null);
                const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS) + Math.random() * 1000;
                attempt += 1;
                retryTimer = setTimeout(connect, delay);
            };
        };

        connect();
        return () => {
            if (retryTimer) clearTimeout(retryTimer);
            source?.close();
            source = null;
        };
    }, []);

    return {
        events: feed.events,
        queued: feed.queued,
        paused: feed.paused,
        pause: () => dispatch({ type: 'pause' }),
        resume: () => dispatch({ type: 'resume' }),
        connection,
        connectedAt,
    };
}

// One shared ticker drives every relative timestamp on the page instead of a timer per row.
const clockListeners = new Set<() => void>();
let clockNow = Date.now();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void) {
    clockListeners.add(listener);
    if (!clockTimer) {
        clockNow = Date.now();
        clockTimer = setInterval(() => {
            clockNow = Date.now();
            clockListeners.forEach(notify => notify());
        }, 1000);
    }
    return () => {
        clockListeners.delete(listener);
        if (clockListeners.size === 0 && clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    };
}

/** Wall clock in ms, ticking once a second. 0 during server render. */
export function useNow(): number {
    return useSyncExternalStore(subscribeClock, () => clockNow, () => 0);
}
