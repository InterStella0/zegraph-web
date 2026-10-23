'use client'
import {ReactNode, useCallback, useEffect, useRef, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import dayjs from "lib/dayjs";
import {Loader2, RefreshCw, Search, Users} from "lucide-react";
import {toast} from "sonner";
import {Button} from "components/ui/button";
import {Input} from "components/ui/input";
import {Skeleton, SkeletonText, varyWidth} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {PlayerAvatar} from "./PlayerAvatar";
import {PlayerName} from "./PlayerName";
import {fetchApiServerUrl, NO_CACHE, range, secondsToHours} from "utils/generalUtils";
import {MightFriendsCalculateStatus, PlayerMightFriendsPage, PlayerSeen} from "types/players.ts";
import {Server} from "types/community.ts";
import {usePeriod} from "components/period/Period";
import {useDebounced} from "lib/hooks/useDebounced";
import {withErrorCatch} from "components/common/withErrorCatch";
import {ServerPlayerProps, useServerPlayer} from "./common";

const SEARCH_DEBOUNCE_MS = 300;
const LIVE_SEARCH_MIN_CHARS = 3;
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60;

function PlayedWithRow({ player, server }: { player: PlayerSeen, server: Server }) {
    const t = useTranslations('players.playedWith');
    const locale = useLocale();
    const name = <PlayerName
        name={player.name}
        isAnonymous={player.is_anonymous}
        hiddenFromOthers={player.hidden_from_others}
    />;
    return (
        <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent transition-colors">
            <PlayerAvatar uuid={player.id} name={player.name} anonymous={player.is_anonymous} />
            <div className="flex-1 min-w-0">
                {player.is_anonymous
                    ? <p className="font-medium truncate">{name}</p>
                    : <HoverPrefetchLink
                        href={`/servers/${server.gotoLink}/players/${player.id}`}
                        className="font-medium truncate block hover:underline"
                    >
                        {name}
                    </HoverPrefetchLink>}
                {player.last_seen && <p className="text-xs text-muted-foreground">
                    {t('lastMet', {time: dayjs(player.last_seen).fromNow()})}
                </p>}
            </div>
            <span className="text-sm font-semibold text-primary flex-shrink-0">
                {t('hoursValue', {value: secondsToHours(player.total_time_together, locale)})}
            </span>
        </div>
    );
}

function PlayedWithSkeletonRow({ index }: { index: number }) {
    return (
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
            <Skeleton className="w-[40px] h-[40px] rounded-[8%] flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="font-medium">
                    <SkeletonText className="h-4" style={varyWidth(index)} />
                </div>
                <div className="text-xs">
                    <SkeletonText className="h-3 w-24" />
                </div>
            </div>
            <div className="text-sm flex-shrink-0">
                <SkeletonText className="h-3.5 w-12" />
            </div>
        </div>
    );
}

function PlayerPlayedWithDisplay({ serverPlayerPromise, heading }: ServerPlayerProps & { heading?: ReactNode }) {
    const t = useTranslations('players.playedWith');
    const {server, playerId} = useServerPlayer(serverPlayerPromise);

    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
    const [page, setPage] = useState(0);
    const [data, setData] = useState<PlayerMightFriendsPage | null>(null);
    const [hasStoredRows, setHasStoredRows] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [polling, setPolling] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const { period } = usePeriod();
    const [shownPeriod, setShownPeriod] = useState(period);
    if (shownPeriod !== period) {
        setShownPeriod(period);
        setPage(0);
        setData(null);
        setPolling(false);
    }

    const load = useCallback(async (): Promise<PlayerMightFriendsPage | null> => {
        if (!playerId) return null;
        const params = { page: String(page), ...(debouncedQuery && {q: debouncedQuery}), ...(period && {period}) };
        const result: PlayerMightFriendsPage = await fetchApiServerUrl(
            server.id, `/players/${playerId}/might_friends`, { ...NO_CACHE, params },
        );
        setData(result);
        if (!debouncedQuery) setHasStoredRows(result.rows.length > 0);
        if (period && result.is_calculating) setPolling(true);
        setError(false);
        return result;
    }, [server.id, playerId, page, debouncedQuery, period]);

    useEffect(() => {
        setPage(0);
    }, [debouncedQuery]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        load()
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [load]);

    const loadRef = useRef(load);
    useEffect(() => {
        loadRef.current = load;
    }, [load]);

    useEffect(() => {
        if (!polling) return;
        let polls = 0;
        const interval = setInterval(async () => {
            polls++;
            try {
                const result = await loadRef.current();
                if (!result?.is_calculating || polls >= MAX_POLLS) setPolling(false);
            } catch {
                setPolling(false);
            }
        }, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [polling]);

    const calculate = async () => {
        if (!playerId) return;
        setRequesting(true);
        try {
            const { status }: { status: MightFriendsCalculateStatus } = await fetchApiServerUrl(
                server.id, `/players/${playerId}/might_friends/calculate`, { method: 'POST' },
            );
            if (status === 'no_sessions') toast.info(t('noSessions'));
            if (status === 'up_to_date') toast.info(t('upToDate'));
            if (status === 'queued' || status === 'calculating') {
                setData(d => d && { ...d, is_calculating: true });
                setPolling(true);
            }
        } catch {
            toast.error(t('failed'));
        } finally {
            setRequesting(false);
        }
    };

    if (!playerId) return null;

    const isCalculating = polling || requesting || !!data?.is_calculating;
    const neverCalculated = !period && data !== null && data.calculated_at === null;
    const partial = neverCalculated && hasStoredRows;
    const canCalculate = data !== null && data.is_stale && !isCalculating;
    const calculateLabel = isCalculating
        ? <><Loader2 className="h-4 w-4 animate-spin" />{t('calculating')}</>
        : null;

    const emptyMessage = () => {
        if (period) {
            if (isCalculating) return t('periodCalculating');
            return debouncedQuery ? t('periodNoMatches', {query: debouncedQuery}) : t('periodEmpty');
        }
        if (!debouncedQuery) return t('empty');
        if (!data?.live_search && debouncedQuery.length < LIVE_SEARCH_MIN_CHARS) return t('noMatchesShort', {query: debouncedQuery});
        return t('noLiveMatches', {query: debouncedQuery});
    };

    return (
        <div className="w-full min-h-[460px] flex flex-col">
            <div className="flex flex-row flex-wrap justify-between items-center mb-3 gap-2">
                {heading ?? <h2 className="text-lg sm:text-xl font-semibold">{t('title')}</h2>}
                {data && !period && (!neverCalculated || partial) && (
                    <Button variant="outline" size="sm" onClick={calculate} disabled={!canCalculate}
                            title={!data.is_stale ? t('upToDate') : undefined}>
                        {calculateLabel ?? <><RefreshCw className="h-4 w-4" />{partial ? t('calculate') : t('recalculate')}</>}
                    </Button>
                )}
            </div>

            <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    className="pl-8 pr-8"
                    placeholder={t('searchPlaceholder')}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                {((loading && data) || (period && isCalculating)) && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
            </div>

            {neverCalculated && !partial && !debouncedQuery ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground px-4">
                    <Users className="w-8 h-8 opacity-50" />
                    <p className="text-sm">{t('neverCalculated')}</p>
                    <Button onClick={calculate} disabled={!canCalculate}>
                        {calculateLabel ?? t('calculate')}
                    </Button>
                    {!data.is_stale && <p className="text-xs">{t('noSessions')}</p>}
                </div>
            ) : (
                <>
                    {data?.live_search && data.rows.length > 0 && (
                        <p className="text-xs text-muted-foreground mb-1">{t('liveSearch')}</p>
                    )}
                    <div className="flex-1 max-h-[470px] overflow-y-auto">
                        {loading && !data && range(20).map(i => <PlayedWithSkeletonRow key={i} index={i} />)}
                        {error && <p className="text-sm text-muted-foreground py-6 text-center">{t('loadError')}</p>}
                        {!error && data && data.rows.length === 0 && (
                            <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage()}</p>
                        )}
                        {!error && data?.rows.map(friend =>
                            <PlayedWithRow key={friend.id} player={friend} server={server} />
                        )}
                    </div>

                    {loading && !data && (
                        <>
                            <div className="mt-2">
                                <Skeleton className="h-9 w-full" />
                            </div>
                            <div className="text-xs">
                                <SkeletonText className="h-3 w-40" />
                            </div>
                        </>
                    )}
                    {data && data.total_pages > 1 && (
                        <div className="mt-2">
                            <PaginationPage totalPages={data.total_pages} page={page} setPage={setPage} compact />
                        </div>
                    )}

                    {data?.calculated_at && !data.live_search && (
                        <p className="text-xs text-muted-foreground mt-2" title={t('staleNote')}>
                            {t('calculatedAsOf', {when: dayjs(data.calculated_at).fromNow()})}
                            {data.is_stale && ` ${t('outdated')}`}
                        </p>
                    )}
                    {partial && !data.live_search && (
                        <p className="text-xs text-muted-foreground mt-2">{t('partial')}</p>
                    )}
                </>
            )}
        </div>
    );
}

export default withErrorCatch(PlayerPlayedWithDisplay, t => t('players.playedWith.loadError'))
