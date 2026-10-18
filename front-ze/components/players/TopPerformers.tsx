'use client'
import {useTranslations} from 'next-intl';
import {useState, use} from 'react';
import { Clock } from 'lucide-react';
import { fetchUrl, secondsToHours } from "utils/generalUtils";
import LeaderboardItem from "./LeaderboardItem";
import dayjs from "dayjs";
import {BriefPlayers} from "types/players";
import {ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import { Skeleton } from "components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "components/ui/select.tsx";
import {useResource} from "lib/hooks/useResource";
import {withErrorCatch} from "components/common/withErrorCatch";

const getPlayerStatus = (player) => {
    if (player.online_since) return 'online';
    const lastPlayed = dayjs(player.last_played_ended ?? player.last_played);
    return lastPlayed > dayjs().subtract(30, 'minutes') ? 'away' : 'offline';
};

const LeaderboardSkeleton = ({ count = 20 }) => (
    <div>
        {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="py-2">
                <div className="flex items-center w-full gap-4">
                    <div className="text-xl font-bold min-w-[30px] text-center">
                        <Skeleton className="inline-block align-middle h-5 w-5" />{'\u200b'}
                    </div>
                    <div className="relative">
                        <Skeleton className="w-[40px] h-[40px] rounded-[22%]" />
                    </div>
                    <div className="flex-1 max-sm:max-w-[9rem] max-w-[10rem] max-sm:text-sm">
                        <Skeleton className="inline-block align-middle h-4" style={{ width: `${4 + (index * 3) % 5}rem` }} />{'\u200b'}
                    </div>
                    <div className="font-semibold max-sm:text-sm ms-auto min-sm:pr-2.5">
                        <Skeleton className="inline-block align-middle h-4 w-12" />{'\u200b'}
                    </div>
                </div>
            </div>
        ))}
    </div>
);
const timeFrames = [
    {id: '1d', labelKey: 'frame1Day', value: 'today'},
    {id: '1w', labelKey: 'frame1Week', value: 'week1'},
    {id: '2w', labelKey: 'frame2Weeks', value: 'week2'},
    {id: '1m', labelKey: 'frame1Month', value: 'month1'},
    {id: '6m', labelKey: 'frame6Months', value: 'month6'},
    {id: '1yr', labelKey: 'frame1Year', value: 'year1'},
]

type TopPerformersProps = { serverPromise: ServerSlugPromise, initialDataPromise: Promise<BriefPlayers> };

const TopPerformersDisplay = ({ serverPromise, initialDataPromise }: TopPerformersProps) => {
    const t = useTranslations('players.topPerformers');
    const server = use(serverPromise)
    const initialData = use(initialDataPromise);
    const [performanceTab, setPerformanceTab] = useState<number>(0);
    const serverId = server.id
    const { data: topPlayers, loading: topPlayersLoading, error } = useResource<BriefPlayers>(
        () => fetchUrl(`/graph/${serverId}/top_players`, {params: {time_frame: timeFrames[performanceTab].value}}),
        [serverId, performanceTab], { initial: initialData, keepData: true, errorLog: 'Error fetching top players:' });
    const topPlayersError = error?.message;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
                <Clock className="w-5 h-5 text-primary"/>
                <h2 className="text-lg max-sm:text-md font-semibold">{t('title')}</h2>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="sm:hidden flex flex-row items-center gap-2 pb-3">
                    {t('within')}
                    <Select
                        value={performanceTab.toString()}
                        onValueChange={(v) => setPerformanceTab(Number(v))}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {timeFrames.map((tf, i) => (
                                <SelectItem key={tf.id} value={i.toString()}>
                                    {t(tf.labelKey)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Tabs className="hidden sm:block"
                      value={performanceTab.toString()}
                      onValueChange={(v) => setPerformanceTab(Number(v))}>
                    <TabsList className="grid w-full grid-cols-6">
                        {timeFrames.map((timeFrame, index) => (
                            <TabsTrigger key={timeFrame.id} value={index.toString()}>
                                {t(timeFrame.labelKey)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
                {topPlayersLoading ? (
                    <LeaderboardSkeleton />
                ) : topPlayersError ? (
                    <div className="p-4 text-center">
                        <p className="text-destructive">{t('loadError', {error: topPlayersError})}</p>
                    </div>
                ) : !topPlayers?.players?.length ? (
                    <div className="p-4 text-center">
                        <p className="text-muted-foreground">{t('emptyState')}</p>
                    </div>
                ) : (
                    <div>
                        {topPlayers.players.map((player) => (
                            <LeaderboardItem
                                key={player.id}
                                item={{
                                    rank: player.rank,
                                    id: player.id,
                                    name: player.name,
                                    is_anonymous: player.is_anonymous,
                                    hidden_from_others: player.hidden_from_others,
                                    time: secondsToHours(player.total_playtime),
                                    status: getPlayerStatus(player)
                                }}
                                server={server}
                            />
                        ))}

                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export function TopPerformersLoading() {
    const t = useTranslations('players.topPerformers');
    return (
        <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
                <Clock className="w-5 h-5 text-primary"/>
                <h2 className="text-lg max-sm:text-md font-semibold">{t('title')}</h2>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="sm:hidden flex flex-row items-center gap-2 pb-3">
                    {t('within')}
                    <Select disabled>
                        <SelectTrigger>
                            <SelectValue placeholder={t(timeFrames[0].labelKey)} />
                        </SelectTrigger>
                    </Select>
                </div>
                <Tabs className="hidden sm:block" value="0">
                    <TabsList className="grid w-full grid-cols-6">
                        {timeFrames.map((timeFrame, index) => (
                            <TabsTrigger key={timeFrame.id} value={index.toString()} disabled>
                                {t(timeFrame.labelKey)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
                <LeaderboardSkeleton />
            </CardContent>
        </Card>
    );
}

export default withErrorCatch(TopPerformersDisplay, () => "Top performers couldn't be loaded.")
