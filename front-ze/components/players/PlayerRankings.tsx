'use client'
import {useLocale, useTranslations} from 'next-intl';
import {useState, useEffect, use} from 'react';
import { Trophy } from 'lucide-react';
import {fetchApiServerUrl, secondsToHours} from "utils/generalUtils";
import {PlayersTableRanked, PlayerTableRank, RankingMode, RankMode, SearchPlayer} from "types/players";
import {Server} from "types/community";
import {ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import { Skeleton, SkeletonText, varyWidth } from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {cn} from "components/lib/utils";
import {useResource} from "lib/hooks/useResource";
import {SearchField} from "components/ui/SearchField";
import {SuggestSearch, useSuggestSearch} from "components/ui/SuggestSearch";
import {withErrorCatch} from "components/common/withErrorCatch";
import {PlayerAvatar} from "./PlayerAvatar";
import {BotBadge, PlayerName} from "./PlayerName";
import {IconCard} from "./IconCard";

const PAGE_SIZE = 5;

const RANKING_MODES: RankingMode[] = [
    {id: 'total', labelKey: 'modeTotalTime', value: 'Total'},
    {id: 'casual', labelKey: 'modeCasual', value: 'Casual'},
    {id: 'tryhard', labelKey: 'modeTryhard', value: 'TryHard'},
]

const PlayerListSkeleton = ({ showMatchedSkeleton = false }) => (
    <>
        {showMatchedSkeleton && (
            <div className="p-4 bg-accent/50 rounded-md mb-4">
                <Skeleton className="w-2/5 h-5"/>
            </div>
        )}
        <div>
            {Array.from({length: PAGE_SIZE}, (_, index) => (
                <div
                    key={index}
                    className="flex items-center gap-3 rounded-md mb-2 border border-border p-3"
                >
                    <Skeleton className="w-[40px] h-[40px] rounded-[8%] flex-shrink-0"/>
                    <div className="flex-1 min-w-0">
                        <div className="font-medium">
                            <SkeletonText className="h-4" style={varyWidth(index, 5, 8)}/>
                        </div>
                        <div className="text-sm max-sm:text-xs">
                            <SkeletonText className="h-3 w-20"/>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-xl max-sm:text-sm">
                            <SkeletonText className="h-4 w-14"/>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </>
);

function PlayerListItem({ player, mode, server }: { player: PlayerTableRank, mode: RankMode, server: Server }) {
    const t = useTranslations('players.listItem');
    const tCommon = useTranslations('common');
    const locale = useLocale();
    const rankLabel = player.is_bot
        ? <><BotBadge className="ml-0 mr-1.5"/>{t('botUnranked')}</>
        : player.rank === -1
            ? t('unranked')
            : t('ranked', {rank: tCommon('ordinal', {n: player.rank})});
    return (
        <div className="flex items-center gap-3 rounded-md mb-2 border border-border p-3 transition-all duration-200 hover:bg-accent/50">
            <div className="flex-shrink-0">
                <PlayerAvatar uuid={player.id} name={player.name} width={40} height={40} anonymous={player.is_anonymous} />
            </div>
            <div className="flex-1 min-w-0">
                {player.is_anonymous ? (
                    <div className="font-medium"><PlayerName name={player.name} isAnonymous /></div>
                ) : (
                    <HoverPrefetchLink href={`/servers/${server.gotoLink}/players/${player.id}`} className="hover:underline">
                        <PlayerName
                            name={player.name}
                            hiddenFromOthers={player.hidden_from_others}
                            className="font-medium max-w-[25rem] max-sm:max-w-[9rem] truncate block"
                        />
                    </HoverPrefetchLink>
                )}
                <div className={cn("text-sm text-muted-foreground", !player.is_anonymous && "max-sm:text-xs")}>{rankLabel}</div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xl max-sm:text-sm text-primary font-semibold">
                    {t('hoursShort', {hours: secondsToHours(player[`${mode.toLowerCase()}_playtime`], locale)})}
                </span>
            </div>
        </div>
    );
}

/** Without `setTab` the tabs render disabled, for the loading state. */
function ModeTabs({ tab = 0, setTab }: { tab?: number, setTab?: (tab: number) => void }) {
    const t = useTranslations('players.rankings');
    return (
        <Tabs value={tab.toString()} onValueChange={setTab && (value => setTab(Number(value)))} className="mb-4">
            <TabsList className="grid w-full grid-cols-3">
                {RANKING_MODES.map((mode, index) => (
                    <TabsTrigger key={mode.id} value={index.toString()} disabled={!setTab}>
                        {t(mode.labelKey)}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}

type PlayerRankingsProps = { serverPromise: ServerSlugPromise, initialDataPromise: Promise<PlayersTableRanked> };

const PlayerRankingsDisplay = ({ serverPromise, initialDataPromise }: PlayerRankingsProps) => {
    const t = useTranslations('players.rankings');
    const server = use(serverPromise)
    const serverId = server.id;
    const initialData = use(initialDataPromise);
    const [rankingTab, setRankingTab] = useState<number>(0);
    const [rankingPage, setRankingPage] = useState<number>(0);
    const currentMode = RANKING_MODES[rankingTab]
    const search = useSuggestSearch<SearchPlayer>({
        fetch: (player_name, signal) => fetchApiServerUrl(serverId, '/players/autocomplete', {params: {player_name}, signal}),
    });
    const searchTerm = search.term;

    const { data: playerRankings, loading, error } = useResource<PlayersTableRanked>(signal => {
        const params = {
            page: rankingPage,
            mode: currentMode.value,
            ...(searchTerm && {player_name: searchTerm})
        };
        return fetchApiServerUrl(serverId, '/players/table', {params, signal});
    }, [serverId, rankingPage, searchTerm, currentMode], { initial: initialData, keepData: true, errorLog: 'Error fetching player rankings:' });
    const pages = Math.ceil((playerRankings?.total_players || 0) / PAGE_SIZE);
    const totalPages = playerRankings === initialData ? Math.max(1, pages) : pages;

    useEffect(() => setRankingPage(0), [searchTerm, rankingTab]);

    return (
        <IconCard icon={Trophy} title={t('title')} className="mb-6">
            <SuggestSearch
                search={search}
                className="mb-4"
                placeholder={t('searchPlaceholder')}
                empty={t('noSuggestions')}
                itemValue={option => option.name}
                itemKey={option => option.id}
                renderItem={option => <PlayerName
                    name={option.name}
                    isAnonymous={option.is_anonymous}
                    hiddenFromOthers={option.hidden_from_others}
                    isBot={option.is_bot}
                    className="font-medium"
                />}
            />

            <ModeTabs tab={rankingTab} setTab={setRankingTab} />

            {loading ? (
                <PlayerListSkeleton showMatchedSkeleton={!!searchTerm} />
            ) : error?.message ? (
                <div className="p-4 text-center">
                    <p className="text-destructive">Error loading player rankings: {error.message}</p>
                </div>
            ) : playerRankings?.players?.length === 0 ? (
                <div className="p-8 text-center">
                    <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                        {t('noPlayersFound')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {searchTerm ? t('noResultsFor', {query: searchTerm}) : t('noPlayersAvailable')}
                    </p>
                </div>
            ) : (
                <>
                    {searchTerm && (
                        <div className="p-4 bg-accent/50 rounded-md mb-4">
                            <p className="text-sm text-muted-foreground">
                                Found {playerRankings?.total_players?.toLocaleString() || 0} players matching "{searchTerm}"
                            </p>
                        </div>
                    )}
                    <div>
                        {playerRankings?.players?.map((player) => (
                            <PlayerListItem key={player.id} player={player} mode={currentMode.value} server={server} />
                        ))}
                    </div>
                </>
            )}

            <div className="flex justify-center mt-4">
                <PaginationPage totalPages={totalPages} page={rankingPage} setPage={setRankingPage} />
            </div>
        </IconCard>
    );
};

export function PlayerRankingsLoading() {
    const t = useTranslations('players.rankings');
    return (
        <IconCard icon={Trophy} title={t('title')} className="mb-6">
            <SearchField className="mb-4" placeholder={t('searchPlaceholder')} disabled/>
            <ModeTabs />
            <PlayerListSkeleton/>
            <div className="flex justify-center mt-4">
                <Skeleton className="h-9 w-64"/>
            </div>
        </IconCard>
    );
}

export default withErrorCatch(PlayerRankingsDisplay, () => "Player rankings couldn't be loaded.")
