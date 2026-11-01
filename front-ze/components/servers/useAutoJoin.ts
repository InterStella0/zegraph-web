'use client'
import {useCallback, useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {Server} from "types/community";
import {steamConnectUrl, URI} from "utils/generalUtils";

/** Mirrors the backend's `SlotEvent` (`src/core/slot_watch.rs`). */
type SlotMeta = { max_players: number, players: number, online: boolean, map?: string | null }
type SlotEvent =
    | { kind: 'snapshot', seq: number, meta: SlotMeta, names: string[] }
    | { kind: 'join', seq: number, name: string }
    | { kind: 'leave', seq: number, name: string }
    | { kind: 'meta', seq: number, meta: SlotMeta }
    | { kind: 'heartbeat', seq: number }

export type AutoJoinStatus = 'idle' | 'confirming' | 'waiting' | 'fired' | 'already-in'

/** What the open stream currently says, for the button label. `null` until the first snapshot. */
export type SlotView = { count: number, maxPlayers: number, online: boolean }

const CONFIRMED_KEY = 'autoJoin.protocolConfirmed'
const STEAM_DETECT_MS = 3000
const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 30000

const normalise = (name: string) => name.trim().toLowerCase()

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
        // Private mode without storage: the dialog simply shows every time.
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

/**
 * Waits for a free slot on `server` and launches Steam the moment one opens, once.
 *
 * The page listens to `/events/servers/:id/players`: a snapshot of every name on the server, then
 * one join/leave per name. Counting happens here. `selfName` (the logged-in Steam name) appearing
 * in the list disarms it, since the user is already on the server.
 */
export function useAutoJoin(server: Server, selfName: string | null) {
    const t = useTranslations('servers.autoJoin')
    const [status, setStatus] = useState<AutoJoinStatus>('idle')
    const [view, setView] = useState<SlotView | null>(null)
    const [steamDetected, setSteamDetected] = useState(false)
    const audioRef = useRef<AudioContext | null>(null)
    const detectCleanupRef = useRef<(() => void) | null>(null)

    const connectUrl = steamConnectUrl(server.fullIp)
    const selfKey = selfName ? normalise(selfName) : ''

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

    const arm = useCallback(() => {
        stopDetecting()
        setView(null)
        setStatus('waiting')
    }, [stopDetecting])

    /** The "Auto join" click. First time on this browser it tries a real join and asks whether
     *  Steam opened; afterwards it arms straight away. */
    const start = useCallback(() => {
        prepareAlerts()
        if (readConfirmed()) {
            arm()
            return
        }
        launch()
        setStatus('confirming')
    }, [prepareAlerts, arm, launch])

    /** Runs the join-first check again, even if it was already confirmed. */
    const testLaunch = useCallback(() => {
        writeConfirmed(false)
        start()
    }, [start])

    const confirmArm = useCallback(() => {
        writeConfirmed(true)
        arm()
    }, [arm])

    const cancel = useCallback(() => {
        stopDetecting()
        setView(null)
        setStatus('idle')
    }, [stopDetecting])

    /** The user clicked "Didn't launch? Join": the automatic launch was blocked, so confirm again
     *  next time. The click itself goes to the Steam link. */
    const reportNotLaunched = useCallback(() => {
        writeConfirmed(false)
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
    const notifyRef = useRef(notify)
    useEffect(() => {
        notifyRef.current = notify
    }, [notify])

    // The stream is open exactly while waiting; leaving that state closes it, which lets the
    // backend stop polling once nobody else watches the server.
    const waiting = status === 'waiting'
    useEffect(() => {
        if (!waiting) return
        let source: EventSource | null = null
        let retryTimer: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        let done = false
        let names = new Map<string, number>()
        let count = 0
        let meta: SlotMeta | null = null
        let seq: number | null = null

        const close = () => {
            source?.close()
            source = null
        }

        const fire = () => {
            done = true
            close()
            setStatus('fired')
            window.location.href = connectUrl
            playChime(audioRef.current)
            void notifyRef.current()
        }

        const evaluate = () => {
            if (!meta) return
            // A server that hides its list sends no names; count from A2S_INFO instead.
            const players = count === 0 && meta.players > 0 ? meta.players : count
            setView({count: players, maxPlayers: meta.max_players, online: meta.online})
            if (selfKey && names.has(selfKey)) {
                done = true
                close()
                setStatus('already-in')
                return
            }
            if (meta.online && meta.max_players > 0 && players < meta.max_players) fire()
        }

        const add = (name: string, delta: number) => {
            const key = normalise(name)
            const next = (names.get(key) ?? 0) + delta
            if (next > 0) names.set(key, next)
            else names.delete(key)
            count = Math.max(0, count + delta)
        }

        const connect = () => {
            if (done) return
            const current = new EventSource(URI(`/events/servers/${server.id}/players`))
            source = current

            current.onopen = () => { attempt = 0 }

            current.onmessage = (message) => {
                if (source !== current) return
                const event: SlotEvent = JSON.parse(message.data)
                if (event.kind === 'heartbeat') return
                if (event.kind === 'snapshot') {
                    names = new Map()
                    count = 0
                    for (const name of event.names) add(name, 1)
                    meta = event.meta
                    seq = event.seq
                    evaluate()
                    return
                }
                if (seq === null || event.seq !== seq + 1) {
                    // Missed an event: reconnect for a fresh snapshot rather than drift.
                    close()
                    connect()
                    return
                }
                seq = event.seq
                if (event.kind === 'join') add(event.name, 1)
                else if (event.kind === 'leave') add(event.name, -1)
                else meta = event.meta
                evaluate()
            }

            current.onerror = () => {
                if (source !== current) return
                close()
                const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS) + Math.random() * 1000
                attempt += 1
                retryTimer = setTimeout(connect, delay)
            }
        }

        connect()
        return () => {
            done = true
            if (retryTimer) clearTimeout(retryTimer)
            close()
        }
    }, [waiting, server.id, connectUrl, selfKey])

    useEffect(() => stopDetecting, [stopDetecting])

    return {status, view, steamDetected, connectUrl, start, launch, confirmArm, cancel, testLaunch, reportNotLaunched}
}
