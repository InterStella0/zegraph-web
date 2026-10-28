'use client'
import {KeyboardEvent, PointerEvent, ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState} from "react";
import Link from "next/link";
import {useLocale, useTranslations} from "next-intl";
import {useTheme} from "next-themes";
import {ChevronLeft, ChevronRight, Info, Loader2, MapPinOff, Pause, Play} from "lucide-react";
import {Button} from "components/ui/button";
import {Skeleton} from "components/ui/skeleton";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "components/ui/tabs";
import {cn} from "components/lib/utils";
import {PlayerAvatar} from "components/players/PlayerAvatar.tsx";
import {PlayerName} from "components/players/PlayerName";
import {range, secondsToHours} from "utils/generalUtils.ts";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {Timeline, TimelineSlider} from "./TemporalController.tsx";
import {useCountryStats, useSettledTemporal} from "./StatComponents.tsx";
import {SafeLegendEntries} from "./Legend.tsx";
import {UNKNOWN_COUNTRY} from "./PlayerPopup.tsx";
import type {CountrySelection} from "./PlayerMapControl.tsx";

type Snap = 'peek' | 'half' | 'full';
const SNAPS: Snap[] = ['peek', 'half', 'full'];
// Tapping the handle steps up through the heights and wraps back down to the peek.
const NEXT_SNAP: Record<Snap, Snap> = { peek: 'half', half: 'full', full: 'peek' };
// Movement under this many pixels is a tap on the handle, not a drag.
const TAP_SLOP = 6;
// Gap left above the sheet at full height, so the map edge still shows it can be dragged back down.
const FULL_GAP = 12;
const PLAYERS_PER_PAGE = 10;

/**
 * Snaps the sheet between the peek (its always-visible header), half and nearly full height of its container,
 * and follows the handle while it is dragged. The peek height is published as `--radar-sheet-peek` on the
 * container so the map's bottom controls can sit above the sheet.
 */
function useSnapSheet(sheetRef: RefObject<HTMLDivElement | null>, peekRef: RefObject<HTMLDivElement | null>) {
    const [snap, setSnap] = useState<Snap>('peek');
    const [dragHeight, setDragHeight] = useState<number | null>(null);
    const [sizes, setSizes] = useState({ container: 0, peek: 0 });
    const dragStart = useRef<{ y: number, height: number } | null>(null);

    useLayoutEffect(() => {
        const container = sheetRef.current.parentElement, peek = peekRef.current;
        const measure = () => setSizes({ container: container.clientHeight, peek: peek.offsetHeight });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        observer.observe(peek);
        return () => observer.disconnect();
    }, [sheetRef, peekRef]);

    useEffect(() => {
        sheetRef.current.parentElement.style.setProperty('--radar-sheet-peek', `${sizes.peek}px`);
    }, [sheetRef, sizes.peek]);

    const heights: Record<Snap, number> = {
        peek: sizes.peek,
        half: Math.max(sizes.peek, sizes.container / 2),
        full: Math.max(sizes.peek, sizes.container - FULL_GAP),
    };

    const endDrag = (isTap: boolean) => {
        const height = dragHeight;
        dragStart.current = null;
        setDragHeight(null);
        if (height !== null)
            setSnap(SNAPS.reduce((best, s) => Math.abs(heights[s] - height) < Math.abs(heights[best] - height) ? s : best));
        else if (isTap)
            setSnap(NEXT_SNAP[snap]);
    };

    const handleProps = {
        role: 'button',
        tabIndex: 0,
        onPointerDown: (e: PointerEvent) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragStart.current = { y: e.clientY, height: heights[snap] };
        },
        onPointerMove: (e: PointerEvent) => {
            const start = dragStart.current;
            if (!start) return;
            const moved = start.y - e.clientY;
            if (dragHeight === null && Math.abs(moved) < TAP_SLOP) return;
            setDragHeight(Math.min(heights.full, Math.max(heights.peek, start.height + moved)));
        },
        onPointerUp: () => dragStart.current && endDrag(true),
        onPointerCancel: () => dragStart.current && endDrag(false),
        onKeyDown: (e: KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            setSnap(NEXT_SNAP[snap]);
        },
    };

    return {
        snap, setSnap, handleProps,
        style: { height: dragHeight ?? heights[snap], transition: dragHeight === null ? 'height 200ms ease-out' : 'none' },
    };
}

function CodeBadge({ code }: { code: string }) {
    return (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-muted-foreground">
            {code}
        </span>
    );
}

function Chip({ selected, disabled, onClick, children }: { selected: boolean, disabled?: boolean, onClick: () => void, children: ReactNode }) {
    return (
        <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onClick}
            className={cn("h-9 px-2 text-xs", selected && "border-primary bg-primary/15 hover:bg-primary/20")}
        >
            {children}
        </Button>
    );
}

function CountPill({ inView, total }: { inView: number, total: number }) {
    const t = useTranslations('radar');
    return (
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="font-bold tabular-nums" title={t('publicLocation')}>{inView}</span>
            <span className="text-muted-foreground tabular-nums" title={t('totalTimeframe')}>/ {total}</span>
        </div>
    );
}

/** The always-visible part: play, the time being shown, the player count and the scrubber. */
function SheetPeek({ timeline, inView, total }: { timeline: Timeline, inView: number, total: number }) {
    const t = useTranslations('radar');
    const { isLive, isPlaying, setIsPlaying, currentTime, selectedRange, selectedInterval, rangeOptions, availableIntervals } = timeline;
    const rangeLabel = rangeOptions.find(o => o.value === selectedRange)?.label;
    const intervalLabel = availableIntervals.find(o => o.value === selectedInterval)?.label;
    return <>
        <div className="flex items-center gap-3 px-4">
            <Button
                size="icon"
                className="size-11 shrink-0 rounded-xl"
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? t('temporal.pause') : t('temporal.play')}
            >
                {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
            </Button>
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs">
                    {isLive && <span className="mr-1 font-bold text-destructive">
                        <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-destructive align-middle" />
                        LIVE
                    </span>}
                    <span className="text-muted-foreground">{isLive && '· '}{rangeLabel} · {intervalLabel}</span>
                </p>
                <p className="truncate font-mono text-sm font-semibold tabular-nums">
                    {currentTime.format(isLive ? 'D MMM · HH:mm:ss' : 'D MMM · HH:mm')}
                </p>
            </div>
            <CountPill inView={inView} total={total} />
        </div>
        <div className="px-4 pb-3">
            <TimelineSlider timeline={timeline} mark={(date, isEnd) => isEnd && isLive ? t('sheet.now') : date.format('MMM D')} />
        </div>
    </>;
}

function CountryList({ countries, loading, inView, total }: {
    countries: { code: string, name: string, count: number }[], loading: boolean, inView: number, total: number,
}) {
    const t = useTranslations('radar');
    return <>
        <div className="flex items-center justify-between px-1 pb-1 text-xs text-muted-foreground">
            <span>{t('sheet.playersOnMap')}</span>
            <span className="tabular-nums">{inView} / {total}</span>
        </div>
        {loading && countries.length === 0
            ? range(4).map(i => <Skeleton key={i} className="my-2 h-9 w-full" />)
            : countries.length === 0
                ? <p className="py-6 text-center text-sm text-muted-foreground">{t('popup.noPlayers')}</p>
                : <ul>
                    {countries.map(country => (
                        <li key={country.code} className="flex items-center gap-3 border-t border-border/60 px-1 py-3">
                            <CodeBadge code={country.code} />
                            <span className="min-w-0 flex-1 truncate text-sm">{country.name}</span>
                            <span className="text-sm font-bold tabular-nums">{country.count}</span>
                        </li>
                    ))}
                </ul>}
    </>;
}

/** The players of the country picked on the map, in place of the country list. */
function CountryDetail({ selection }: { selection: CountrySelection }) {
    const t = useTranslations('radar');
    const locale = useLocale();
    const { server } = useServerData();
    const { popup, changePage, clear } = selection;
    const { position, countryData, playerData, totalPlayers, page, isLoading, error } = popup;
    const totalPages = Math.ceil(totalPlayers / PLAYERS_PER_PAGE);
    const coordinates = `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
    const title = countryData?.properties.name
        ?? (error ? t(error === UNKNOWN_COUNTRY ? 'popup.nothingFound' : 'popup.error') : t('popup.loading'));

    return <>
        <div className="flex items-center gap-3 pb-3">
            <Button variant="outline" size="icon" className="shrink-0" onClick={clear} aria-label={t('sheet.back')}>
                <ChevronLeft />
            </Button>
            {countryData && <CodeBadge code={countryData.properties.code} />}
            <div className="min-w-0">
                <p className="truncate font-bold text-primary">{title}</p>
                <p className="font-mono text-xs text-muted-foreground">{coordinates}</p>
            </div>
        </div>

        {error ? (
            <div className="flex flex-col items-center py-6 text-center">
                <MapPinOff className="size-10 text-muted-foreground" />
                {error !== UNKNOWN_COUNTRY && <p className="mt-2 text-xs text-muted-foreground">{error}</p>}
            </div>
        ) : isLoading && playerData.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm">
                <Loader2 className="size-4 animate-spin" />
                {t('popup.loadingPlayers')}
            </div>
        ) : <>
            <p className="px-1 pb-1 text-xs text-muted-foreground">{t('popup.players', { count: totalPlayers })}</p>
            <ul className={cn(isLoading && "opacity-60")}>
                {playerData.map(player => (
                    <li key={player.id} className="border-t border-border/60">
                        <Link href={`/servers/${server.gotoLink}/players/${player.id}`} className="flex items-center gap-3 px-1 py-2.5">
                            <PlayerAvatar uuid={player.id} name={player.name} width={36} height={36} className="shrink-0 rounded-md" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                    <PlayerName name={player.name} isAnonymous={player.is_anonymous} hiddenFromOthers={player.hidden_from_others} />
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t('popup.playerStats', { hours: secondsToHours(player.total_playtime, locale), sessions: player.session_count })}
                                </p>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                    </li>
                ))}
            </ul>
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                    <Button variant="ghost" size="icon-sm" disabled={page === 0 || isLoading} onClick={() => changePage(page - 1)}>
                        <ChevronLeft />
                    </Button>
                    <span className="text-xs tabular-nums">{page + 1} / {totalPages}</span>
                    <Button variant="ghost" size="icon-sm" disabled={page + 1 >= totalPages || isLoading} onClick={() => changePage(page + 1)}>
                        <ChevronRight />
                    </Button>
                </div>
            )}
        </>}
    </>;
}

function PlaybackPanel({ timeline }: { timeline: Timeline }) {
    const t = useTranslations('radar.sheet');
    const {
        isLive, selectedRange, selectedInterval, rangeOptions, availableIntervals, canStepBackward, canStepForward,
        stepBackward, stepForward, toggleLiveMode, handleRangeChange, handleIntervalChange,
    } = timeline;
    return (
        <div className="flex flex-col gap-4 pb-2">
            <section>
                <p className="px-1 pb-2 text-xs text-muted-foreground">{t('range')}</p>
                <div className="grid grid-cols-3 gap-2">
                    {rangeOptions.map(o => (
                        <Chip key={o.value} selected={o.value === selectedRange} onClick={() => handleRangeChange(o.value)}>{o.label}</Chip>
                    ))}
                </div>
            </section>
            <section>
                <p className="px-1 pb-2 text-xs text-muted-foreground">{t('interval')}</p>
                <div className="grid grid-cols-3 gap-2">
                    {availableIntervals.map(o => (
                        <Chip key={o.value} selected={o.value === selectedInterval} disabled={isLive}
                              onClick={() => handleIntervalChange(o.value)}>{o.label}</Chip>
                    ))}
                </div>
            </section>
            <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={!canStepBackward} onClick={stepBackward}>
                    <ChevronLeft />{t('stepBack')}
                </Button>
                <Button variant="outline" disabled={!canStepForward} onClick={stepForward}>
                    {t('stepForward')}<ChevronRight />
                </Button>
            </div>
            <Button
                variant="outline"
                onClick={toggleLiveMode}
                className={cn(!isLive && "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive")}
            >
                {isLive ? t('exitLive') : t('jumpToLive')}
            </Button>
        </div>
    );
}

/**
 * The mobile radar's single bottom sheet, holding what floats over the map on desktop: the timeline, player
 * distribution, playback options and legend. A country picked on the map opens its players here.
 */
export default function RadarSheet({ timeline, selection }: { timeline: Timeline, selection: CountrySelection }) {
    const t = useTranslations('radar');
    const { server } = useServerData();
    const isDarkMode = useTheme().resolvedTheme === 'dark';
    const sheetRef = useRef<HTMLDivElement>(null);
    const peekRef = useRef<HTMLDivElement>(null);
    const { snap, setSnap, handleProps, style } = useSnapSheet(sheetRef, peekRef);
    const [tab, setTab] = useState('players');
    const { stats, loading } = useCountryStats(useSettledTemporal(), server.id);

    // A country picked on the map opens with room to list its players.
    const picked = selection.popup?.position;
    useEffect(() => {
        if (!picked) return;
        setTab('players');
        setSnap(current => current === 'peek' ? 'half' : current);
    }, [picked, setSnap]);

    return (
        <div
            ref={sheetRef}
            style={style}
            className="absolute inset-x-0 bottom-0 z-[1000] flex flex-col overflow-hidden rounded-t-2xl border-t bg-background/95 shadow-[0_-8px_24px_rgb(0_0_0/0.25)] backdrop-blur-md"
        >
            <div ref={peekRef} className="shrink-0">
                <div {...handleProps} aria-label={t('sheet.resize')} aria-expanded={snap !== 'peek'}
                     className="flex h-6 cursor-grab touch-none items-center justify-center active:cursor-grabbing">
                    <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
                </div>
                <SheetPeek timeline={timeline} inView={stats.in_view_count} total={stats.total_count} />
            </div>

            <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-3 px-4 pb-4">
                <TabsList className="grid h-10 w-full shrink-0 grid-cols-3">
                    <TabsTrigger value="players">{t('sheet.players')}</TabsTrigger>
                    <TabsTrigger value="playback">{t('sheet.playback')}</TabsTrigger>
                    <TabsTrigger value="legend">{t('legend')}</TabsTrigger>
                </TabsList>
                <TabsContent value="players" className="min-h-0 overflow-y-auto overscroll-contain">
                    {selection.popup
                        ? <CountryDetail selection={selection} />
                        : <CountryList countries={stats.countries} loading={loading} inView={stats.in_view_count} total={stats.total_count} />}
                </TabsContent>
                <TabsContent value="playback" className="min-h-0 overflow-y-auto overscroll-contain">
                    <PlaybackPanel timeline={timeline} />
                </TabsContent>
                <TabsContent value="legend" className="min-h-0 overflow-y-auto overscroll-contain">
                    <div className="flex flex-col gap-1 px-1 text-sm">
                        <SafeLegendEntries isDarkMode={isDarkMode} />
                    </div>
                    <p className="mt-4 flex gap-2 px-1 text-xs text-muted-foreground">
                        <Info className="size-4 shrink-0" />
                        {t('infoDefault')}
                    </p>
                </TabsContent>
            </Tabs>
        </div>
    );
}
