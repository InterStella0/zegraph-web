'use client'
import {useTranslations} from 'next-intl';
import {useState, useEffect, use} from 'react';
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

const getPlayerStatus = (player) => {
    if (player.online_since) return 'online';
    const lastPlayed = dayjs(player.last_played);
    return lastPlayed > dayjs().subtract(30, 'minutes') ? 'away' : 'offline';
};

const LeaderboardSkeleton = ({ count = 20 }) => (
    <div className="space-y-2">
        {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="py-2">
                <div className="flex items-center w-full gap-4">
                    <Skeleton className="w-[30px] h-6" />
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <Skeleton className="flex-1 h-5" />
                    <Skeleton className="w-15 h-5" />
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

const TopPerformers = ({ serverPromise }: { serverPromise: ServerSlugPromise }) => {
    const t = useTranslations('players.topPerformers');
    const server = use(serverPromise)
    const [performanceTab, setPerformanceTab] = useState<number>(0);
    const [topPlayers, setTopPlayers] = useState<BriefPlayers | null>(null);
    const [topPlayersLoading, setTopPlayersLoading] = useState(true);
    const [topPlayersError, setTopPlayersError] = useState(null);
    const serverId = server.id

    const fetchTopPlayers = async () => {
        try {
            setTopPlayersLoading(true);
            setTopPlayersError(null);
            const currentTimeFrame = timeFrames[performanceTab];
            const params = {time_frame: currentTimeFrame.value};
            const data: BriefPlayers = await fetchUrl(`/graph/${serverId}/top_players`, {params});
            setTopPlayers(data);
        } catch (error) {
            console.error('Error fetching top players:', error);
            setTopPlayersError(error.message);
        } finally {
            setTopPlayersLoading(false);
        }
    };

    useEffect(() => {
        fetchTopPlayers();
    }, [serverId, performanceTab]);

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
                ) : (
                    <div>
                        {topPlayers?.players?.map((player) => (
                            <LeaderboardItem
                                key={player.id}
                                item={{
                                    rank: player.rank,
                                    id: player.id,
                                    name: player.name,
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

export default TopPerformers;
