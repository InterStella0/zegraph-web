'use client'
import {useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {ArrowDown, Check, CircleCheck, Hourglass, Loader2, Minus, MonitorPlay, Play, Plus, RotateCcw, Search, Timer, Users, X} from "lucide-react";
import {Button} from "components/ui/button";
import {Input} from "components/ui/input";
import {ScrollArea} from "components/ui/scroll-area";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "components/ui/dialog";
import {cn} from "components/lib/utils";
import {Server} from "types/community";
import {SteamProfile} from "types/steam";
import {PlayerDetailSession} from "types/players";
import {PlayerAvatar} from "components/players/PlayerAvatar";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink";
import {fetchServerUrl} from "utils/generalUtils";
import {effectiveTarget, SlotView, useAutoJoin} from "components/servers/useAutoJoin";

/** A poll older than this reads as stale: polls are at most 3s apart while the server answers. */
const FRESH_MS = 6000
const SEARCH_FROM = 10
/** Short enough that the whole dialog fits a laptop screen with the auto join controls above. */
const LIST_HEIGHT = 'h-[clamp(9rem,30vh,16rem)]'

/** The site's own online list is scraped, not live, and cached 20s by the API; this only adds
 *  avatars and profile links to the live names, so it refreshes slowly. */
const ROSTER_REFRESH_MS = 30_000
const ROW_AVATAR_PX = 24

const rosterKey = (name: string) => name.trim().toLowerCase()

/** Online players by name, for decorating the live A2S names. A name two players share maps to
 *  `null`: there is no telling which one it is, so it stays plain text. Anonymized players come
 *  back from the API without their name and so never match. */
type Roster = Map<string, PlayerDetailSession | null>

function indexRoster(players: PlayerDetailSession[]): Roster {
    const roster: Roster = new Map()
    for (const player of players) {
        if (player.is_anonymous || player.hidden_from_others || !player.name) continue
        const key = rosterKey(player.name)
        const known = roster.get(key)
        roster.set(key, known === undefined || known?.id === player.id ? player : null)
    }
    return roster
}

/** The server's online players from the API, refetched every `ROSTER_REFRESH_MS` while
 *  `enabled`. A name the live list has but this does not yet stays plain until a refetch has it. */
function useOnlineRoster(serverId: string, enabled: boolean): Roster {
    const [roster, setRoster] = useState<Roster>(() => new Map())
    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        const load = () => fetchServerUrl(serverId, '/players/playing')
            .then((players: PlayerDetailSession[] | null) => { if (!cancelled) setRoster(indexRoster(players ?? [])) })
            .catch(error => console.warn('Online player list unavailable, showing plain names:', error))
        load()
        const timer = setInterval(load, ROSTER_REFRESH_MS)
        return () => {
            cancelled = true
            clearInterval(timer)
        }
    }, [serverId, enabled])
    return roster
}

/** The current time, re-rendered every second while `enabled`, for poll ages and play times. */
function useNow(enabled: boolean): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!enabled) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [enabled])
    return now
}

/** `1:04:09` or `4:09`. */
function formatPlayed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor(total / 60) % 60
    const seconds = String(total % 60).padStart(2, '0')
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

function PollIndicator({ view, age }: { view: SlotView | null, age: number | null }) {
    const t = useTranslations('servers.autoJoin')
    const fresh = view?.online && age !== null && age < FRESH_MS
    const tone = !view ? 'bg-muted-foreground' : !view.online ? 'bg-destructive' : fresh ? 'bg-green-500' : 'bg-amber-500'
    const label = !view
        ? t('connecting')
        : age === null
            ? t('neverPolled')
            : age < 60_000
                ? t('polled', {seconds: Math.floor(age / 1000)})
                : t('polledMinutes', {minutes: Math.floor(age / 60_000)})
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <span className="relative flex h-2 w-2">
                {fresh && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", tone)} />}
                <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone)} />
            </span>
            {view && !view.online ? `${t('serverOffline')} · ${label}` : label}
        </div>
    )
}

type SortKey = 'time' | 'name'

function PlayerList({ view, selfName, now, roster, server }: {
    view: SlotView | null, selfName: string | null, now: number, roster: Roster, server: Server,
}) {
    const t = useTranslations('servers.autoJoin')
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState<SortKey>('time')
    const selfKey = selfName?.trim().toLowerCase() || null
    const players = view?.players
    const needle = query.trim().toLowerCase()
    const shown = useMemo(() => {
        const list = (players ?? []).filter(player => !needle || player.name.toLowerCase().includes(needle))
        return list.sort((a, b) => {
            if (sort === 'name' && (a.name === '') !== (b.name === '')) return a.name === '' ? 1 : -1
            const byName = a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})
            return sort === 'name' ? byName || a.since - b.since : a.since - b.since || byName
        })
    }, [players, needle, sort])
    const total = players?.length ?? 0

    const placeholder = !view
        ? <Loader2 className="h-5 w-5 animate-spin" />
        : !view.online
            ? t('notAnswering')
            : view.hidden
                ? t('hiddenList')
                : total === 0
                    ? t('empty')
                    : shown.length === 0 ? t('noMatch') : null

    const header = (key: SortKey, label: string, className: string) => (
        <button
            type="button"
            onClick={() => setSort(key)}
            className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === key && "text-foreground", className)}
        >
            {label}
            <ArrowDown className={cn("h-3 w-3", sort !== key && "invisible")} />
        </button>
    )

    return (
        <div className="space-y-2">
            {total >= SEARCH_FROM && (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t('search')}
                        className="h-8 pl-8"
                    />
                </div>
            )}
            <div className="overflow-hidden rounded-md border">
                <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    <span className="w-6 text-right">#</span>
                    {header('name', t('sortName'), 'flex-1')}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            {header('time', t('sortTime'), 'justify-end')}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{t('timeNote')}</TooltipContent>
                    </Tooltip>
                </div>
                <ScrollArea className={LIST_HEIGHT}>
                    {placeholder !== null ? (
                        <div className={cn("flex items-center justify-center px-6 text-center text-sm text-muted-foreground", LIST_HEIGHT)}>
                            {placeholder}
                        </div>
                    ) : (
                        <ol className="text-sm">
                            {shown.map((player, index) => {
                                const self = selfKey !== null && player.name.trim().toLowerCase() === selfKey
                                return (
                                    <li
                                        key={`${player.name}\u0000${player.since}\u0000${index}`}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-1.5 odd:bg-muted/20",
                                            self && "bg-primary/10 odd:bg-primary/10",
                                        )}
                                    >
                                        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                                        <span className="flex min-w-0 flex-1 items-center gap-2">
                                            <PlayerCell name={player.name} known={roster.get(rosterKey(player.name))} server={server} />
                                            {self && (
                                                <span className="shrink-0 rounded bg-primary px-1.5 text-[10px] font-semibold uppercase text-primary-foreground">
                                                    {t('you')}
                                                </span>
                                            )}
                                        </span>
                                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                                            {formatPlayed(now - player.since)}
                                        </span>
                                    </li>
                                )
                            })}
                        </ol>
                    )}
                </ScrollArea>
            </div>
        </div>
    )
}

/** Everyone with auto join armed on this server, this tab included once it is armed. */
function WaitingList({ view, selfName }: { view: SlotView | null, selfName: string | null }) {
    const t = useTranslations('servers.autoJoin')
    if (!view) return null
    const {names, anonymous} = view.waiting
    const selfKey = selfName?.trim().toLowerCase() || null
    const total = names.length + anonymous
    return (
        <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Hourglass className="h-3.5 w-3.5" />
                {t('waitingTitle')}
                {total > 0 && <span className="tabular-nums">· {total}</span>}
            </p>
            {total === 0 ? (
                <p className="text-sm text-muted-foreground">{t('waitingNobody')}</p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {names.map(name => {
                        const self = selfKey !== null && name.trim().toLowerCase() === selfKey
                        return (
                            <span
                                key={name}
                                title={name}
                                className={cn(
                                    "max-w-[12rem] truncate rounded-full border px-2.5 py-0.5 text-xs",
                                    self && "border-primary bg-primary/10 font-medium",
                                )}
                            >
                                {self ? `${name} (${t('you')})` : name}
                            </span>
                        )
                    })}
                    {anonymous > 0 && (
                        <span className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground">
                            {t('waitingAnonymous', {count: anonymous})}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

/** One live name: with avatar and profile link once the API's online list knows it, plain text
 *  until then. The spacer keeps plain names lined up with the decorated ones. */
function PlayerCell({ name, known, server }: { name: string, known: PlayerDetailSession | null | undefined, server: Server }) {
    const t = useTranslations('servers.autoJoin')
    if (name === '') {
        return (
            <>
                <span className="shrink-0" style={{width: ROW_AVATAR_PX}} />
                <span className="italic text-muted-foreground">{t('connectingPlayer')}</span>
            </>
        )
    }
    if (!known) {
        return (
            <>
                <span className="shrink-0" style={{width: ROW_AVATAR_PX}} />
                <span className="truncate" title={name}>{name}</span>
            </>
        )
    }
    return (
        <>
            <PlayerAvatar uuid={known.id} name={name} width={ROW_AVATAR_PX} height={ROW_AVATAR_PX} serverId={server.id} className="shrink-0" />
            <HoverPrefetchLink href={`/servers/${server.gotoLink}/players/${known.id}`} className="min-w-0 truncate hover:underline">
                <span title={name}>{name}</span>
            </HoverPrefetchLink>
        </>
    )
}

function TargetPicker({ goal, max, onChange }: { goal: number, max: number, onChange: (target: number) => void }) {
    const t = useTranslations('servers.autoJoin')
    const highest = Math.max(0, max - 1)
    // Typing goes to a draft and applies on Enter or blur. Applying each keystroke would leave the
    // field impossible to clear and pass through targets like the "6" of "62", which an armed watch
    // could fire on.
    const [draft, setDraft] = useState<string | null>(null)
    const commit = () => {
        const typed = Number.parseInt(draft ?? '', 10)
        if (!Number.isNaN(typed)) onChange(typed)
        setDraft(null)
    }
    const presets = [highest, highest - 1, highest - 2].filter(n => n >= 0)
    return (
        <div className="space-y-2">
            <p className="text-sm font-medium">{t('targetLabel')}</p>
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center">
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-r-none" onClick={() => onChange(goal - 1)}
                            disabled={goal <= 0} aria-label="-1">
                        <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={highest}
                        value={draft ?? goal}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={e => { if (e.key === 'Enter') commit() }}
                        className="h-8 w-16 rounded-none border-x-0 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        aria-label={t('targetLabel')}
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-l-none" onClick={() => onChange(goal + 1)}
                            disabled={goal >= highest} aria-label="+1">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">/ {max}</span>
                <div className="flex flex-wrap gap-1.5">
                    {presets.map(n => (
                        <Button key={n} size="sm" variant={n === goal ? 'default' : 'outline'} className="h-7 px-2.5 tabular-nums"
                                onClick={() => onChange(n)}>
                            {n === highest ? t('anySlot', {count: n}) : n}
                        </Button>
                    ))}
                </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('targetHint', {free: max - goal, target: goal, max})}</p>
        </div>
    )
}

/** Opens a live view of who is on `server`, from which an automatic Steam join can be armed for
 *  when the player count drops to a chosen number. */
export default function AutoJoinButton({ server, user }: { server: Server, user: SteamProfile | null }) {
    const t = useTranslations('servers.autoJoin')
    const [open, setOpen] = useState(false)
    const [showHelp, setShowHelp] = useState(false)
    const {
        status, view, target, setTarget, holding, steamDetected, connectUrl,
        arm, launch, confirmArm, cancel, testLaunch, reportNotLaunched,
    } = useAutoJoin(server, user?.personaname ?? null, open)
    const now = useNow(open)
    const roster = useOnlineRoster(server.id, open)
    const age = view?.polledAt == null ? null : Math.max(0, now - view.polledAt)

    if (!server.status) return null

    const max = view?.maxPlayers || server.max_players
    const goal = effectiveTarget(target, max)
    const count = view?.count ?? null

    const openModal = () => {
        setShowHelp(false)
        setOpen(true)
    }
    const onOpenChange = (next: boolean) => {
        // Closing mid-check abandons it; an armed watch keeps running with the modal closed.
        if (!next && status === 'confirming') cancel()
        setOpen(next)
    }
    const startArm = () => {
        setShowHelp(false)
        arm()
    }

    const trigger = (() => {
        if (status === 'armed') {
            const label = !view
                ? t('connecting')
                : !view.online
                    ? t('serverOffline')
                    : t(holding ? 'holding' : 'armedButton', {count: view.count, max: view.maxPlayers, target: goal})
            return (
                <Button variant="secondary" size="sm" onClick={openModal}>
                    <span className="relative mr-2 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    <span className="tabular-nums">{label}</span>
                </Button>
            )
        }
        if (status === 'fired') {
            return (
                <>
                    <Button variant="default" size="sm" asChild>
                        <a href={connectUrl} onClick={reportNotLaunched}>
                            <Play className="mr-2 h-4 w-4" />
                            {t('didntLaunch')}
                        </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={openModal}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('rearm')}
                    </Button>
                </>
            )
        }
        if (status === 'already-in') {
            return (
                <Button variant="outline" size="sm" onClick={cancel} aria-label={t('dismiss')}>
                    <CircleCheck className="mr-2 h-4 w-4 text-green-500" />
                    {t('alreadyIn')}
                    <X className="ml-2 h-4 w-4" />
                </Button>
            )
        }
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={openModal}>
                        <Timer className="mr-2 h-4 w-4" />
                        {t('autoJoin')}
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t('hint')}</TooltipContent>
            </Tooltip>
        )
    })()

    const panel = (() => {
        if (status === 'confirming') {
            return (
                <div className="space-y-3">
                    <div>
                        <p className="text-sm font-medium">{t('dialogTitle')}</p>
                        <p className="text-sm text-muted-foreground">{t('dialogDescription', {server: server.name})}</p>
                    </div>
                    {steamDetected && (
                        <p className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                            <Check className="h-4 w-4" />
                            {t('steamDetected')}
                        </p>
                    )}
                    {showHelp && (
                        <div className="space-y-3 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                            <p>{t('helpText')}</p>
                            <Button variant="secondary" size="sm" onClick={launch}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                {t('tryAgain')}
                            </Button>
                        </div>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowHelp(true)}>{t('didntOpen')}</Button>
                        <Button size="sm" onClick={confirmArm}>{t('confirmArm')}</Button>
                    </div>
                </div>
            )
        }
        if (status === 'fired') {
            return (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                        <Check className="h-4 w-4 text-green-500" />
                        {t('fired')}
                    </p>
                    <div className="flex gap-2">
                        <Button size="sm" asChild>
                            <a href={connectUrl} onClick={reportNotLaunched}>
                                <Play className="mr-2 h-4 w-4" />
                                {t('didntLaunch')}
                            </a>
                        </Button>
                        <Button variant="outline" size="sm" onClick={startArm}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t('rearm')}
                        </Button>
                    </div>
                </div>
            )
        }
        if (status === 'already-in' || (status === 'idle' && view?.selfIn)) {
            return (
                <p className="flex items-center gap-2 text-sm font-medium">
                    <CircleCheck className="h-4 w-4 text-green-500" />
                    {t('alreadyIn')}
                </p>
            )
        }
        const armed = status === 'armed'
        return (
            <div className="space-y-3">
                <TargetPicker goal={goal} max={max} onChange={setTarget} />
                {armed && (
                    <div className="flex items-start gap-2 rounded-md bg-primary/10 p-2.5 text-sm">
                        <span className="relative mt-1.5 flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                        <div>
                            <p className="font-medium tabular-nums">{t('armedTitle', {target: goal, max})}</p>
                            <p className="text-muted-foreground">{t(holding ? 'holdingHint' : 'keepOpen')}</p>
                        </div>
                    </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={testLaunch}>
                                <MonitorPlay className="mr-2 h-4 w-4" />
                                {t('testLaunch')}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{t('testLaunchHint')}</TooltipContent>
                    </Tooltip>
                    {armed ? (
                        <Button variant="outline" size="sm" onClick={cancel}>
                            <X className="mr-2 h-4 w-4" />
                            {t('cancel')}
                        </Button>
                    ) : (
                        <Button size="sm" onClick={startArm} disabled={!view?.online}>
                            <Timer className="mr-2 h-4 w-4" />
                            {t('arm')}
                        </Button>
                    )}
                </div>
            </div>
        )
    })()

    return (
        <>
            {trigger}
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 pr-6">
                            <Users className="h-5 w-5 shrink-0" />
                            <span className="truncate">{server.name}</span>
                        </DialogTitle>
                        <DialogDescription className="truncate">{view?.map ?? server.map}</DialogDescription>
                    </DialogHeader>

                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <p className="text-3xl font-semibold tabular-nums leading-none">
                                {count ?? '–'}
                                <span className="text-lg text-muted-foreground">/{max}</span>
                            </p>
                            {view?.online && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {t('freeSlots', {free: Math.max(0, view.maxPlayers - view.count)})}
                                </p>
                            )}
                        </div>
                        <PollIndicator view={view} age={age} />
                    </div>

                    <div className="rounded-md border bg-muted/20 p-3">{panel}</div>

                    <WaitingList view={view} selfName={user?.personaname ?? null} />

                    <PlayerList view={view} selfName={user?.personaname ?? null} now={now} roster={roster} server={server} />

                    <DialogFooter className="sm:justify-start">
                        <p className="text-xs text-muted-foreground">{t('footnote')}</p>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
