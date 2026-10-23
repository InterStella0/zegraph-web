'use client'
import {useTranslations} from 'next-intl';
import {useState, use} from 'react';
import { Circle, Clock } from 'lucide-react';
import { fetchUrl, secondsToHours } from "utils/generalUtils";
import dayjs from "lib/dayjs";
import {BriefPlayers, PlayerBrief} from "types/players";
import {Server} from "types/community";
import {ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import { Skeleton, SkeletonText, varyWidth } from "components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "components/ui/select.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {useResource} from "lib/hooks/useResource";
import {withErrorCatch} from "components/common/withErrorCatch";
import {PlayerAvatar} from "./PlayerAvatar";
import {PlayerName} from "./PlayerName";
import {IconCard} from "./IconCard";

const TIME_FRAMES = [
    {id: '1d', labelKey: 'frame1Day', value: 'today'},
    {id: '1w', labelKey: 'frame1Week', value: 'week1'},
    {id: '2w', labelKey: 'frame2Weeks', value: 'week2'},
    {id: '1m', labelKey: 'frame1Month', value: 'month1'},
    {id: '6m', labelKey: 'frame6Months', value: 'month6'},
    {id: '1yr', labelKey: 'frame1Year', value: 'year1'},
]

const STATUS_COLORS = {
    online: 'hsl(var(--success))',
    away: 'hsl(var(--warning))',
    offline: 'hsl(var(--muted-foreground))',
};

const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

function playerStatus(player: PlayerBrief): keyof typeof STATUS_COLORS {
    if (player.online_since) return 'online';
    const lastPlayed = dayjs(player.last_played_ended ?? player.last_played);
    return lastPlayed > dayjs().subtract(30, 'minutes') ? 'away' : 'offline';
}

function LeaderboardItem({ player, server }: { player: PlayerBrief, server: Server }) {
    return (
        <div className="py-2 rounded-md hover:bg-accent hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200">
            <div className="flex items-center w-full gap-4">
                <span
                    className="text-xl font-bold min-w-[30px] text-center"
                    style={{ color: RANK_COLORS[player.rank - 1] || 'inherit' }}
                >
                    {player.rank}
                </span>
                <div className="relative">
                    <PlayerAvatar uuid={player.id} name={player.name} />
                    <Circle
                        className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
                        style={{ color: STATUS_COLORS[playerStatus(player)] }}
                        fill="currentColor"
                    />
                </div>
                <HoverPrefetchLink
                    href={`/servers/${server.gotoLink}/players/${player.id}`}
                    className="flex-1 hover:underline max-sm:max-w-[9rem] max-w-[10rem] truncate max-sm:text-sm"
                >
                    <PlayerName
                        name={player.name}
                        isAnonymous={player.is_anonymous}
                        hiddenFromOthers={player.hidden_from_others}
                    />
                </HoverPrefetchLink>
                <span className="text-primary font-semibold max-sm:text-sm ms-auto min-sm:pr-2.5">
                    {secondsToHours(player.total_playtime)}hr
                </span>
            </div>
        </div>
    );
}

const LeaderboardSkeleton = () => (
    <div>
        {Array.from({ length: 20 }, (_, index) => (
            <div key={index} className="py-2">
                <div className="flex items-center w-full gap-4">
                    <div className="text-xl font-bold min-w-[30px] text-center">
                        <SkeletonText className="h-5 w-5" />
                    </div>
                    <div className="relative">
                        <Skeleton className="w-[40px] h-[40px] rounded-[8%]" />
                    </div>
                    <div className="flex-1 max-sm:max-w-[9rem] max-w-[10rem] max-sm:text-sm">
                        <SkeletonText className="h-4" style={varyWidth(index, 4, 5)} />
                    </div>
                    <div className="font-semibold max-sm:text-sm ms-auto min-sm:pr-2.5">
                        <SkeletonText className="h-4 w-12" />
                    </div>
                </div>
            </div>
        ))}
    </div>
);

/** Without `setTab` the picker renders disabled, for the loading state. */
function TimeFramePicker({ tab = 0, setTab }: { tab?: number, setTab?: (tab: number) => void }) {
    const t = useTranslations('players.topPerformers');
    const onValueChange = setTab && ((value: string) => setTab(Number(value)));
    return (
        <>
            <div className="sm:hidden flex flex-row items-center gap-2 pb-3">
                {t('within')}
                {setTab ? (
                    <Select value={tab.toString()} onValueChange={onValueChange}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_FRAMES.map((timeFrame, index) => (
                                <SelectItem key={timeFrame.id} value={index.toString()}>
                                    {t(timeFrame.labelKey)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Select disabled>
                        <SelectTrigger>
                            <SelectValue placeholder={t(TIME_FRAMES[0].labelKey)} />
                        </SelectTrigger>
                    </Select>
                )}
            </div>
            <Tabs className="hidden sm:block" value={tab.toString()} onValueChange={onValueChange}>
                <TabsList className="grid w-full grid-cols-6">
                    {TIME_FRAMES.map((timeFrame, index) => (
                        <TabsTrigger key={timeFrame.id} value={index.toString()} disabled={!setTab}>
                            {t(timeFrame.labelKey)}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </>
    );
}

type TopPerformersProps = { serverPromise: ServerSlugPromise, initialDataPromise: Promise<BriefPlayers> };

const TopPerformersDisplay = ({ serverPromise, initialDataPromise }: TopPerformersProps) => {
    const t = useTranslations('players.topPerformers');
    const server = use(serverPromise)
    const initialData = use(initialDataPromise);
    const [tab, setTab] = useState<number>(0);
    const serverId = server.id
    const { data: topPlayers, loading, error } = useResource<BriefPlayers>(
        () => fetchUrl(`/graph/${serverId}/top_players`, {params: {time_frame: TIME_FRAMES[tab].value}}),
        [serverId, tab], { initial: initialData, keepData: true, errorLog: 'Error fetching top players:' });

    return (
        <IconCard icon={Clock} title={t('title')}>
            <TimeFramePicker tab={tab} setTab={setTab} />
            {loading ? (
                <LeaderboardSkeleton />
            ) : error?.message ? (
                <div className="p-4 text-center">
                    <p className="text-destructive">{t('loadError', {error: error.message})}</p>
                </div>
            ) : !topPlayers?.players?.length ? (
                <div className="p-4 text-center">
                    <p className="text-muted-foreground">{t('emptyState')}</p>
                </div>
            ) : (
                <div>
                    {topPlayers.players.map(player => <LeaderboardItem key={player.id} player={player} server={server} />)}
                </div>
            )}
        </IconCard>
    );
};

export function TopPerformersLoading() {
    const t = useTranslations('players.topPerformers');
    return (
        <IconCard icon={Clock} title={t('title')}>
            <TimeFramePicker />
            <LeaderboardSkeleton />
        </IconCard>
    );
}

export default withErrorCatch(TopPerformersDisplay, () => "Top performers couldn't be loaded.")
