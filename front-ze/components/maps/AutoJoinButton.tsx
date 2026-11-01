'use client'
import {useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {Check, CircleCheck, Loader2, Minus, MonitorPlay, Play, Plus, RotateCcw, Search, Timer, Users, X} from "lucide-react";
import {Button} from "components/ui/button";
import {Input} from "components/ui/input";
import {ScrollArea} from "components/ui/scroll-area";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "components/ui/dialog";
import {cn} from "components/lib/utils";
import {Server} from "types/community";
import {SteamProfile} from "types/steam";
import {effectiveTarget, SlotView, useAutoJoin} from "components/servers/useAutoJoin";

/** A poll older than this reads as stale: polls are at most 3s apart while the server answers. */
const FRESH_MS = 6000
const SEARCH_FROM = 10

/** Seconds since the last answered poll, re-rendered every second while shown. */
function usePollAge(polledAt: number | null, enabled: boolean): number | null {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!enabled) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [enabled])
    return polledAt === null ? null : Math.max(0, now - polledAt)
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

function PlayerList({ view, selfName }: { view: SlotView | null, selfName: string | null }) {
    const t = useTranslations('servers.autoJoin')
    const [query, setQuery] = useState('')
    const selfKey = selfName?.trim().toLowerCase() || null
    const players = view?.players ?? []
    const needle = query.trim().toLowerCase()
    const shown = useMemo(
        () => needle ? players.filter(name => name.toLowerCase().includes(needle)) : players,
        [players, needle],
    )

    const placeholder = !view
        ? <Loader2 className="h-5 w-5 animate-spin" />
        : !view.online
            ? t('notAnswering')
            : view.hidden
                ? t('hiddenList')
                : players.length === 0
                    ? t('empty')
                    : shown.length === 0 ? t('noMatch') : null

    return (
        <div className="space-y-2">
            {players.length >= SEARCH_FROM && (
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
            <ScrollArea className="h-56 rounded-md border">
                {placeholder !== null ? (
                    <div className="flex h-56 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {placeholder}
                    </div>
                ) : (
                    <ul className="grid grid-cols-1 gap-x-2 p-1.5 text-sm sm:grid-cols-2">
                        {shown.map((name, index) => {
                            const self = selfKey !== null && name.trim().toLowerCase() === selfKey
                            return (
                                <li key={`${name}\u0000${index}`} className={cn("flex min-w-0 items-center gap-2 rounded px-2 py-1", self && "bg-primary/10")}>
                                    {name === ''
                                        ? <span className="italic text-muted-foreground">{t('connectingPlayer')}</span>
                                        : <span className="truncate" title={name}>{name}</span>}
                                    {self && <span className="ml-auto shrink-0 rounded bg-primary px-1.5 text-[10px] font-semibold uppercase text-primary-foreground">{t('you')}</span>}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </ScrollArea>
        </div>
    )
}

function TargetPicker({ goal, max, onChange }: { goal: number, max: number, onChange: (target: number) => void }) {
    const t = useTranslations('servers.autoJoin')
    const highest = Math.max(0, max - 1)
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
                        value={goal}
                        onChange={e => { if (!Number.isNaN(e.target.valueAsNumber)) onChange(e.target.valueAsNumber) }}
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
    const age = usePollAge(view?.polledAt ?? null, open)

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
                <DialogContent className="sm:max-w-lg">
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

                    <PlayerList view={view} selfName={user?.personaname ?? null} />

                    <div className="rounded-md border p-3">{panel}</div>

                    <DialogFooter className="sm:justify-start">
                        <p className="text-xs text-muted-foreground">{t('footnote')}</p>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
