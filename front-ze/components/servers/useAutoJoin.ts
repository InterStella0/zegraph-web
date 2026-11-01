'use client'
import {useCallback, useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {Server} from "types/community";
import {steamConnectUrl, URI} from "utils/generalUtils";
import {sendJson} from "lib/sendJson";

/** Mirrors the backend's `SlotEvent` (`src/core/slot_watch.rs`). */
type SlotMeta = { max_players: number, players: number, online: boolean, map?: string | null }
type SlotPlayer = { name: string, connected_ms: number }
/** Who has auto join armed: named signed-in users, plus a count of everyone else. */
export type SlotWaiting = { names: string[], anonymous: number }
type SlotEvent =
    | { kind: 'snapshot', seq: number, meta: SlotMeta, players: SlotPlayer[], polled_ms_ago?: number, waiting?: SlotWaiting }
    | { kind: 'join', seq: number, player: SlotPlayer }
    | { kind: 'leave', seq: number, player: SlotPlayer }
    | { kind: 'meta', seq: number, meta: SlotMeta }
    | { kind: 'poll', seq: number }
    | { kind: 'waiting', seq: number, waiting: SlotWaiting }
    | { kind: 'heartbeat', seq: number }
    | { kind: 'rotate', seq: number }

export type AutoJoinStatus = 'idle' | 'confirming' | 'armed' | 'fired' | 'already-in'

/** A player on the server. `since` is the local time (ms) they connected, per the server, so the
 *  time on the server is `Date.now() - since`. A `""` name is a player still connecting. */
export type LivePlayer = { name: string, since: number }

/** What the open stream currently says. `null` until the first snapshot. */
export type SlotView = {
    /** Every player, duplicates kept, in no particular order. */
    players: LivePlayer[]
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
    waiting: SlotWaiting
}

const CONFIRMED_KEY = 'autoJoin.protocolConfirmed'
const STEAM_DETECT_MS = 3000
const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 30000

const normalise = (name: string) => name.trim().toLowerCase()

const newClientId = () =>
    globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`

const TAB_KEY = 'autoJoin.tab'

/** Identifies this tab to the waiting list, so its reconnects, and its reloads, count as one
 *  waiter. Kept in sessionStorage, which belongs to the tab and outlives a reload. */
function tabIdOfThisTab(): string {
    try {
        const saved = sessionStorage.getItem(TAB_KEY)
        if (saved) return saved
        const id = newClientId()
        sessionStorage.setItem(TAB_KEY, id)
        return id
    } catch {
        return newClientId()
    }
}

/** Tells the backend this page is done with the stream it opened as `conn`. Proxies in front do
 *  not pass a closed stream on, so without this it would stay open (and listed as waiting) until
 *  the server rotates it. A beacon, because it must also go out while the page unloads. */
function sendStreamClose(serverId: string, conn: string) {
    const url = URI(`/events/servers/${serverId}/players/close?conn=${encodeURIComponent(conn)}`)
    try {
        if (navigator.sendBeacon?.(url)) return
    } catch {
        // Fall through to fetch.
    }
    fetch(url, {method: 'POST', keepalive: true}).catch(() => {})
}

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

/** An armed watch survives a reload of its tab (sessionStorage), but no more: a tab reopened long
 *  after should not launch Steam on its own. Counted from when it was armed. */
const ARMED_MAX_AGE_MS = 6 * 60 * 60 * 1000
const armedKey = (serverId: string) => `autoJoin.armed.${serverId}`
type SavedArm = { target: number | null, at: number }

function readArmed(serverId: string): SavedArm | null {
    try {
        const saved = JSON.parse(sessionStorage.getItem(armedKey(serverId)) ?? 'null')
        if (typeof saved?.at !== 'number' || Date.now() - saved.at > ARMED_MAX_AGE_MS) {
            sessionStorage.removeItem(armedKey(serverId))
            return null
        }
        return {target: typeof saved.target === 'number' ? saved.target : null, at: saved.at}
    } catch {
        return null
    }
}

/** Saves the armed target, keeping the original arming time; `undefined` forgets it. */
function writeArmed(serverId: string, target: number | null | undefined) {
    try {
        if (target === undefined) {
            sessionStorage.removeItem(armedKey(serverId))
            return
        }
        const at = readArmed(serverId)?.at ?? Date.now()
        sessionStorage.setItem(armedKey(serverId), JSON.stringify({target, at}))
    } catch {
        // No storage: arming just does not survive a reload.
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

const NOBODY_WAITING: SlotWaiting = {names: [], anonymous: 0}

type Live = { players: LivePlayer[], meta: SlotMeta | null, polledAt: number | null, waiting: SlotWaiting }
const emptyLive = (): Live => ({players: [], meta: null, polledAt: null, waiting: NOBODY_WAITING})

const playersOf = (live: Live, meta: SlotMeta) =>
    live.players.length === 0 && meta.players > 0 ? meta.players : live.players.length

const toLive = (player: SlotPlayer, receivedAt: number): LivePlayer =>
    ({name: player.name, since: receivedAt - player.connected_ms})

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
    const [ticket, setTicket] = useState<string | null>(null)
    const [tabId] = useState(tabIdOfThisTab)

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
        writeArmed(server.id, next === 'armed' ? targetRef.current : undefined)
    }, [server.id])

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
        if (selfKey && live.players.some(player => normalise(player.name) === selfKey)) {
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
        if (statusRef.current === 'armed') writeArmed(server.id, next)
        check()
    }, [check, server.id])

    // Re-arm after a reload. It fires on the first snapshot if the target is already met, like any
    // arm. Sound needs a click to unlock, so the first click on the page restores the chime.
    useEffect(() => {
        const saved = readArmed(server.id)
        if (!saved) return
        targetRef.current = saved.target
        setTargetState(saved.target)
        holdRef.current = false
        changeStatus('armed')
        const unlock = () => prepareAlerts()
        window.addEventListener('pointerdown', unlock, {once: true})
        return () => window.removeEventListener('pointerdown', unlock)
    }, [server.id, changeStatus, prepareAlerts])

    /** The user clicked "Didn't launch? Join": the automatic launch was blocked, so run the Steam
     *  check again next time. The click itself goes to the Steam link. */
    const reportNotLaunched = useCallback(() => {
        writeConfirmed(false)
    }, [])

    // A signed-in user's ticket, fetched once the modal opens (or when a reload restores an arm), so
    // arming lists them by name without waiting on a request. Without one (signed out, or the
    // request failed) they wait anonymously.
    const signedIn = selfName !== null
    const wantsTicket = watching || status === 'armed'
    useEffect(() => {
        if (!wantsTicket || !signedIn || ticket) return
        let cancelled = false
        sendJson<{ ticket: string }>(`/servers/${server.id}/auto-join-ticket`, 'POST', null)
            .then(result => { if (!cancelled) setTicket(result.ticket) })
            .catch(error => console.warn('No auto join ticket, waiting anonymously:', error))
        return () => { cancelled = true }
    }, [wantsTicket, signedIn, ticket, server.id])

    const active = watching || status === 'armed'
    const armed = status === 'armed'
    // Arming reconnects with these, which lists this tab in the waiting list until it disconnects.
    const streamQuery = armed ? `?${new URLSearchParams({armed: 'true', tab: tabId, ...(ticket ? {ticket} : {})})}` : ''
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
            setView({
                players: [...live.players],
                count: playersOf(live, meta),
                maxPlayers: meta.max_players,
                online: meta.online,
                map: meta.map ?? null,
                hidden: live.players.length === 0 && meta.players > 0,
                selfIn: !!selfKey && live.players.some(player => normalise(player.name) === selfKey),
                polledAt: live.polledAt,
                waiting: live.waiting,
            })
            checkRef.current()
        }

        /** Removes the player who left: by name, and among players sharing it, the one whose
         *  connect time is nearest, which is how the server told them apart. */
        const remove = (gone: LivePlayer) => {
            let at = -1
            for (let i = 0; i < live.players.length; i++) {
                const player = live.players[i]
                if (player.name !== gone.name) continue
                if (at < 0 || Math.abs(player.since - gone.since) < Math.abs(live.players[at].since - gone.since)) at = i
            }
            if (at >= 0) live.players.splice(at, 1)
        }

        let conn: string | null = null
        const close = () => {
            source?.close()
            source = null
            if (conn) sendStreamClose(server.id, conn)
            conn = null
        }
        // A reload or closed tab never runs the cleanup below; this does. A page restored from the
        // back/forward cache comes back without its stream, so reopen it then.
        const onPageHide = () => close()
        const onPageShow = (event: PageTransitionEvent) => { if (event.persisted && !done && !source) connect() }
        window.addEventListener('pagehide', onPageHide)
        window.addEventListener('pageshow', onPageShow)

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
            const params = new URLSearchParams(streamQuery.slice(1))
            conn = newClientId()
            params.set('conn', conn)
            const current = new EventSource(URI(`/events/servers/${server.id}/players?${params}`))
            source = current

            current.onmessage = (message) => {
                if (source !== current) return
                const event: SlotEvent = JSON.parse(message.data)
                if (event.kind === 'heartbeat') return
                if (event.kind === 'rotate') {
                    // The server ends streams on purpose every couple of minutes; come straight
                    // back rather than through the error backoff. The snapshot resyncs everything.
                    close()
                    connect()
                    return
                }
                if (event.kind === 'waiting') {
                    // A whole list, so order against other events does not matter.
                    live.waiting = event.waiting
                    publish()
                    return
                }
                const receivedAt = Date.now()
                if (event.kind === 'snapshot') {
                    live.players = event.players.map(player => toLive(player, receivedAt))
                    live.meta = event.meta
                    live.waiting = event.waiting ?? NOBODY_WAITING
                    live.polledAt = event.polled_ms_ago === undefined ? null : receivedAt - event.polled_ms_ago
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
                if (event.kind === 'join') live.players.push(toLive(event.player, receivedAt))
                else if (event.kind === 'leave') remove(toLive(event.player, receivedAt))
                else if (event.kind === 'meta') live.meta = event.meta
                else live.polledAt = receivedAt
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
            window.removeEventListener('pagehide', onPageHide)
            window.removeEventListener('pageshow', onPageShow)
            close()
            // The view stays: arming reconnects, and the list should not blank for it. A view from
            // a closed stream is hidden below instead, and a reopened one shows its own poll age.
            liveRef.current = emptyLive()
        }
    }, [active, server.id, selfKey, streamQuery])

    useEffect(() => stopDetecting, [stopDetecting])

    return {
        status, view: active ? view : null, target, setTarget, holding, steamDetected, connectUrl,
        arm, launch, confirmArm, cancel, testLaunch, reportNotLaunched,
    }
}
