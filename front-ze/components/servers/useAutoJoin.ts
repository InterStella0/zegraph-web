'use client'
import {useCallback, useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {Server} from "types/community";
import {steamConnectUrl, URI} from "utils/generalUtils";

/** Mirrors the backend's `SlotEvent` (`src/core/slot_watch.rs`). */
type SlotMeta = { max_players: number, players: number, online: boolean, map?: string | null }
type SlotEvent =
    | { kind: 'snapshot', seq: number, meta: SlotMeta, names: string[], polled_ms_ago?: number }
    | { kind: 'join', seq: number, name: string }
    | { kind: 'leave', seq: number, name: string }
    | { kind: 'meta', seq: number, meta: SlotMeta }
    | { kind: 'poll', seq: number }
    | { kind: 'heartbeat', seq: number }

export type AutoJoinStatus = 'idle' | 'confirming' | 'armed' | 'fired' | 'already-in'

/** What the open stream currently says. `null` until the first snapshot. */
export type SlotView = {
    /** Every player, sorted, duplicates kept. `""` is a player still connecting. */
    players: string[]
    /** Player count, from the names, or from the server's own total when it hides them. */
    count: number
    maxPlayers: number
    online: boolean
    map: string | null
    /** The server reports players but sends no names. */
    hidden: boolean
    selfIn: boolean
    /** Local time (ms) the server last answered a poll, or `null` if it never has. */
    polledAt: number | null
}

const CONFIRMED_KEY = 'autoJoin.protocolConfirmed'
const STEAM_DETECT_MS = 3000
const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 30000

const normalise = (name: string) => name.trim().toLowerCase()

/** The player count to join at: what the user picked, else the first free slot. */
export function effectiveTarget(target: number | null, maxPlayers: number): number {
    const highest = Math.max(0, maxPlayers - 1)
    return target === null ? highest : Math.min(Math.max(0, Math.round(target)), highest)
}

function readConfirmed(): boolean {
    try {
        return localStorage.getItem(CONFIRMED_KEY) === '1'
    } catch {
        return false
    }
}

function writeConfirmed(confirmed: boolean) {
    try {
        if (confirmed) localStorage.setItem(CONFIRMED_KEY, '1')
        else localStorage.removeItem(CONFIRMED_KEY)
    } catch {
        // Private mode without storage: the Steam check simply runs every time.
    }
}

/** Two short rising tones. The context is created inside a click so the browser lets it play
 *  later from a stream event. */
function playChime(ctx: AudioContext | null) {
    if (!ctx) return
    const start = ctx.currentTime
    for (const [offset, frequency] of [[0, 660], [0.18, 880]] as const) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = frequency
        gain.gain.setValueAtTime(0.0001, start + offset)
        gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.3)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start + offset)
        osc.stop(start + offset + 0.32)
    }
}

/** Plays the chime, resuming the context first: Safari can suspend it during a long wait, and a
 *  suspended context schedules the tones silently. The click already unlocked it, so resuming
 *  needs no new gesture. */
function ringChime(ctx: AudioContext | null) {
    if (!ctx) return
    if (ctx.state === 'running') {
        playChime(ctx)
        return
    }
    ctx.resume().then(() => playChime(ctx)).catch(() => {})
}

type Live = { names: Map<string, number>, count: number, meta: SlotMeta | null, polledAt: number | null }
const emptyLive = (): Live => ({names: new Map(), count: 0, meta: null, polledAt: null})

const playersOf = (live: Live, meta: SlotMeta) =>
    live.count === 0 && meta.players > 0 ? meta.players : live.count

/**
 * Live player list of `server`, plus an auto join that launches Steam once, when the player count
 * drops to the chosen target.
 *
 * The stream (`/events/servers/:id/players`) is open while `watching` (the modal is open) or while
 * armed: a snapshot of every name, then one join/leave per name, and a `poll` each time the server
 * answers. Counting happens here. `selfName` (the logged-in Steam name) in the list disarms it,
 * since the user is already on the server.
 */
export function useAutoJoin(server: Server, selfName: string | null, watching: boolean) {
    const t = useTranslations('servers.autoJoin')
    const [status, setStatus] = useState<AutoJoinStatus>('idle')
    const [view, setView] = useState<SlotView | null>(null)
    const [target, setTargetState] = useState<number | null>(null)
    const [holding, setHolding] = useState(false)
    const [steamDetected, setSteamDetected] = useState(false)

    const statusRef = useRef<AutoJoinStatus>('idle')
    const targetRef = useRef<number | null>(null)
    /** Set when arming right after the Steam check: see `armNow`. */
    const holdRef = useRef(false)
    const liveRef = useRef<Live>(emptyLive())
    const audioRef = useRef<AudioContext | null>(null)
    const detectCleanupRef = useRef<(() => void) | null>(null)

    const connectUrl = steamConnectUrl(server.fullIp)
    const selfKey = selfName ? normalise(selfName) : ''

    const changeStatus = useCallback((next: AutoJoinStatus) => {
        statusRef.current = next
        setStatus(next)
        if (next !== 'armed') setHolding(false)
    }, [])

    const stopDetecting = useCallback(() => {
        detectCleanupRef.current?.()
        detectCleanupRef.current = null
    }, [])

    /** Launches Steam (must be called from a click) and watches for it taking focus. */
    const launch = useCallback(() => {
        stopDetecting()
        setSteamDetected(false)
        const detected = () => {
            setSteamDetected(true)
            stopDetecting()
        }
        const onVisibility = () => { if (document.hidden) detected() }
        window.addEventListener('blur', detected)
        document.addEventListener('visibilitychange', onVisibility)
        const timer = setTimeout(stopDetecting, STEAM_DETECT_MS)
        detectCleanupRef.current = () => {
            window.removeEventListener('blur', detected)
            document.removeEventListener('visibilitychange', onVisibility)
            clearTimeout(timer)
        }
        window.location.href = connectUrl
    }, [connectUrl, stopDetecting])

    /** Permission prompts and audio unlock need the click's user activation. */
    const prepareAlerts = useCallback(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {})
        }
        try {
            audioRef.current ??= new AudioContext()
            audioRef.current.resume().catch(() => {})
        } catch {
            audioRef.current = null
        }
    }, [])

    const notify = useCallback(async () => {
        if (!('Notification' in window) || Notification.permission !== 'granted') return
        const title = t('notificationTitle', {server: server.name})
        const options: NotificationOptions = {
            body: t('notificationBody'),
            icon: '/favicon.png',
            tag: `auto-join-${server.id}`,
            requireInteraction: true,
            data: {serverId: server.id, url: `/connect/${server.id}`},
        }
        try {
            const registration = await navigator.serviceWorker?.getRegistration()
            if (registration) {
                // `join_now` is handled by public/sw.js and opens /connect/<id>.
                // `actions` is real in Chromium but missing from TypeScript's DOM types.
                const withActions = {...options, actions: [{action: 'join_now', title: t('joinNow')}]}
                await registration.showNotification(title, withActions as NotificationOptions)
                return
            }
            const notification = new Notification(title, options)
            notification.onclick = () => {
                window.focus()
                window.location.href = connectUrl
                notification.close()
            }
        } catch (error) {
            console.error('Failed to show auto join notification:', error)
        }
    }, [t, server.id, server.name, connectUrl])

    /** Fires if armed and the count is at or under the target. Runs after every stream event, and
     *  straight from the arm and target clicks, so a target that is already met launches Steam
     *  inside that click. */
    const check = useCallback(() => {
        const live = liveRef.current
        const meta = live.meta
        if (statusRef.current !== 'armed' || !meta) return
        if (selfKey && [...live.names.keys()].some(name => normalise(name) === selfKey)) {
            changeStatus('already-in')
            return
        }
        if (!meta.online || meta.max_players <= 0) {
            setHolding(false)
            return
        }
        const players = playersOf(live, meta)
        const goal = effectiveTarget(targetRef.current, meta.max_players)
        if (players > goal) holdRef.current = false
        const met = players <= goal
        setHolding(met && holdRef.current)
        if (!met || holdRef.current) return

        changeStatus('fired')
        window.location.href = connectUrl
        ringChime(audioRef.current)
        void notify()
    }, [selfKey, connectUrl, changeStatus, notify])
    const checkRef = useRef(check)
    useEffect(() => {
        checkRef.current = check
    }, [check])

    /** Arms. `hold` is for arming right after the Steam check: if the target was already met, the
     *  user is probably connecting through that slot already (and shows up nameless until they
     *  finish), so firing would launch a second connect over the first. Such an arm only fires once
     *  it has seen the count above the target. */
    const armNow = useCallback((hold: boolean) => {
        stopDetecting()
        holdRef.current = hold
        changeStatus('armed')
        check()
    }, [stopDetecting, changeStatus, check])

    /** The "Arm" click. First time on this browser it tries a real join and asks whether Steam
     *  opened; afterwards it arms straight away. */
    const arm = useCallback(() => {
        prepareAlerts()
        if (readConfirmed()) {
            armNow(false)
            return
        }
        launch()
        changeStatus('confirming')
    }, [prepareAlerts, armNow, launch, changeStatus])

    /** Runs the Steam check, even if it was already confirmed. Arms nothing on its own. */
    const testLaunch = useCallback(() => {
        writeConfirmed(false)
        prepareAlerts()
        launch()
        changeStatus('confirming')
    }, [prepareAlerts, launch, changeStatus])

    const confirmArm = useCallback(() => {
        writeConfirmed(true)
        armNow(true)
    }, [armNow])

    const cancel = useCallback(() => {
        stopDetecting()
        changeStatus('idle')
    }, [stopDetecting, changeStatus])

    const setTarget = useCallback((next: number | null) => {
        targetRef.current = next
        setTargetState(next)
        check()
    }, [check])

    /** The user clicked "Didn't launch? Join": the automatic launch was blocked, so run the Steam
     *  check again next time. The click itself goes to the Steam link. */
    const reportNotLaunched = useCallback(() => {
        writeConfirmed(false)
    }, [])

    const active = watching || status === 'armed'
    useEffect(() => {
        if (!active) return
        let source: EventSource | null = null
        let retryTimer: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        let done = false
        let seq: number | null = null
        const live = emptyLive()
        liveRef.current = live

        const publish = () => {
            const meta = live.meta
            if (!meta) return
            const players = [...live.names].flatMap(([name, n]) => Array<string>(n).fill(name))
            players.sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))
            setView({
                players,
                count: playersOf(live, meta),
                maxPlayers: meta.max_players,
                online: meta.online,
                map: meta.map ?? null,
                hidden: live.count === 0 && meta.players > 0,
                selfIn: !!selfKey && players.some(name => normalise(name) === selfKey),
                polledAt: live.polledAt,
            })
            checkRef.current()
        }

        const add = (name: string, delta: number) => {
            const next = (live.names.get(name) ?? 0) + delta
            if (next > 0) live.names.set(name, next)
            else live.names.delete(name)
            live.count = Math.max(0, live.count + delta)
        }

        const close = () => {
            source?.close()
            source = null
        }

        /** Retries with backoff. `attempt` resets only after an in-order event, not on open or on
         *  a snapshot, so a stream that keeps going wrong right after connecting still backs off. */
        const reconnect = () => {
            close()
            if (done) return
            const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS) + Math.random() * 1000
            attempt += 1
            retryTimer = setTimeout(connect, delay)
        }

        const connect = () => {
            if (done) return
            const current = new EventSource(URI(`/events/servers/${server.id}/players`))
            source = current

            current.onmessage = (message) => {
                if (source !== current) return
                const event: SlotEvent = JSON.parse(message.data)
                if (event.kind === 'heartbeat') return
                if (event.kind === 'snapshot') {
                    live.names = new Map()
                    live.count = 0
                    for (const name of event.names) add(name, 1)
                    live.meta = event.meta
                    live.polledAt = event.polled_ms_ago === undefined ? null : Date.now() - event.polled_ms_ago
                    seq = event.seq
                    publish()
                    return
                }
                // A poll carries the seq of the last event before it; every other event the next one.
                const expected = seq === null ? null : event.kind === 'poll' ? seq : seq + 1
                if (event.seq !== expected) {
                    // Missed an event: reconnect for a fresh snapshot rather than drift.
                    reconnect()
                    return
                }
                seq = event.seq
                attempt = 0
                if (event.kind === 'join') add(event.name, 1)
                else if (event.kind === 'leave') add(event.name, -1)
                else if (event.kind === 'meta') live.meta = event.meta
                else live.polledAt = Date.now()
                publish()
            }

            current.onerror = () => {
                if (source !== current) return
                reconnect()
            }
        }

        connect()
        return () => {
            done = true
            if (retryTimer) clearTimeout(retryTimer)
            close()
            liveRef.current = emptyLive()
            setView(null)
        }
    }, [active, server.id, selfKey])

    useEffect(() => stopDetecting, [stopDetecting])

    return {
        status, view, target, setTarget, holding, steamDetected, connectUrl,
        arm, launch, confirmArm, cancel, testLaunch, reportNotLaunched,
    }
}
