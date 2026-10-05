'use client'
import {ReactNode, use, useCallback, useEffect, useRef, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {Loader2, RefreshCw, Search, Users} from "lucide-react";
import {toast} from "sonner";
import {Button} from "components/ui/button";
import {Input} from "components/ui/input";
import {Skeleton} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {PlayerAvatar} from "./PlayerAvatar";
import {PlayerName} from "./PlayerName";
import {fetchApiServerUrl, secondsToHours, StillCalculate} from "utils/generalUtils";
import {MightFriendsCalculateStatus, PlayerMightFriendsPage, PlayerSeen} from "types/players.ts";
import {Server} from "types/community.ts";
import {ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page.tsx";

dayjs.extend(relativeTime);

const SEARCH_DEBOUNCE_MS = 300;
// The backend only falls back to a live search across the whole server from this length on.
const LIVE_SEARCH_MIN_CHARS = 3;
const POLL_INTERVAL_MS = 5000;
// The job takes well under a second even for the heaviest players; this only bounds a stuck queue.
const MAX_POLLS = 60;
const NO_CACHE = { cache: "no-store", headers: { "Cache-Control": "no-cache" } } as const;

function useDebounced<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return debounced;
}

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

type PlayedWithProps = { serverPlayerPromise: Promise<ServerPlayerDetailed>, heading?: ReactNode };

function PlayerPlayedWithDisplay({ serverPlayerPromise, heading }: PlayedWithProps) {
    const t = useTranslations('players.playedWith');
    const {server, player} = use(serverPlayerPromise);
    const playerId = !(player instanceof StillCalculate) ? player.id : null;

    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
    const [page, setPage] = useState(0);
    const [data, setData] = useState<PlayerMightFriendsPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [polling, setPolling] = useState(false);
    const [requesting, setRequesting] = useState(false);

    const load = useCallback(async (): Promise<PlayerMightFriendsPage | null> => {
        if (!playerId) return null;
        const params: Record<string, string> = { page: String(page) };
        if (debouncedQuery) params.q = debouncedQuery;
        const result: PlayerMightFriendsPage = await fetchApiServerUrl(
            server.id, `/players/${playerId}/might_friends`, { ...NO_CACHE, params },
        );
        setData(result);
        setError(false);
        return result;
    }, [server.id, playerId, page, debouncedQuery]);

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

    // A calculation was queued: keep re-reading the list until the job is no longer in flight.
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
    const neverCalculated = data !== null && data.calculated_at === null;
    const canCalculate = data !== null && data.is_stale && !isCalculating;
    const calculateLabel = isCalculating
        ? <><Loader2 className="h-4 w-4 animate-spin" />{t('calculating')}</>
        : null;

    const emptyMessage = () => {
        if (!debouncedQuery) return t('empty');
        if (data?.live_search) return t('noLiveMatches', {query: debouncedQuery});
        if (debouncedQuery.length < LIVE_SEARCH_MIN_CHARS) return t('noMatchesShort', {query: debouncedQuery});
        return t('noLiveMatches', {query: debouncedQuery});
    };

    return (
        <div className="w-full min-h-[460px] flex flex-col">
            <div className="flex flex-row flex-wrap justify-between items-center mb-3 gap-2">
                {heading ?? <h2 className="text-lg sm:text-xl font-semibold">{t('title')}</h2>}
                {data && !neverCalculated && (
                    <Button variant="outline" size="sm" onClick={calculate} disabled={!canCalculate}
                            title={!data.is_stale ? t('upToDate') : undefined}>
                        {calculateLabel ?? <><RefreshCw className="h-4 w-4" />{t('recalculate')}</>}
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
                {loading && data && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
            </div>

            {neverCalculated && !debouncedQuery ? (
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
                    {/* Shorter than the sessions list by the search box and footer, so both tabs are the same height. */}
                    <div className="flex-1 max-h-[470px] overflow-y-auto">
                        {loading && !data && Array.from({length: 6}).map((_, i) =>
                            <Skeleton key={i} className="h-12 w-full my-1" />
                        )}
                        {error && <p className="text-sm text-muted-foreground py-6 text-center">{t('loadError')}</p>}
                        {!error && data && data.rows.length === 0 && (
                            <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage()}</p>
                        )}
                        {!error && data?.rows.map(friend =>
                            <PlayedWithRow key={friend.id} player={friend} server={server} />
                        )}
                    </div>

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
                </>
            )}
        </div>
    );
}

export default function PlayerPlayedWith({ serverPlayerPromise, heading }: PlayedWithProps) {
    const t = useTranslations('players.playedWith');
    return <ErrorCatch message={t('loadError')}>
        <PlayerPlayedWithDisplay serverPlayerPromise={serverPlayerPromise} heading={heading} />
    </ErrorCatch>
}
