import {ReactElement, use} from 'react';
import { User, Globe, Clock } from 'lucide-react';
import { fetchServerUrl, secondsToHours } from "utils/generalUtils";
import { ServerPlayersStatistic } from "types/players.ts";
import {ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import { Card, CardContent } from "components/ui/card";
import { getTranslations, getLocale } from "next-intl/server";

const getStatsCards = (stats: ServerPlayersStatistic, t: (key: string) => string, locale: string) => {
    if (!stats) return [];

    return [
        {
            label: t('totalPlayers'),
            thisWeek: stats.week1?.total_players?.toLocaleString(locale) || '0',
            allTime: stats.all_time?.total_players?.toLocaleString(locale) || '0',
            icon: <User className="w-7 h-7" />,
            weekLabel: t('thisWeek'),
            allTimeLabel: t('allTime')
        },
        {
            label: t('cumulativeHours'),
            thisWeek: secondsToHours(stats.week1?.total_cum_playtime || 0, locale),
            allTime: secondsToHours(stats.all_time?.total_cum_playtime || 0, locale),
            icon: <Clock className="w-7 h-7" />,
            weekLabel: t('thisWeek'),
            allTimeLabel: t('allTime')
        },
        {
            label: t('countries'),
            thisWeek: stats.week1?.countries?.toString() || '0',
            allTime: stats.all_time?.countries?.toString() || '0',
            icon: <Globe className="w-7 h-7" />,
            weekLabel: t('thisWeek'),
            allTimeLabel: t('allTime')
        }
    ];
};

export default async function StatsCards({ serverPromise }: {serverPromise: ServerSlugPromise}): Promise<ReactElement> {
    const server = await serverPromise
    const stats: ServerPlayersStatistic = await fetchServerUrl(server.id, '/players/stats', {});
    const t = await getTranslations('players.statsCards');
    const locale = await getLocale();

    return <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {getStatsCards(stats, t, locale).map((stat, index) => (
                <Card key={index} className="h-full">
                    <CardContent className="text-center py-4 px-4">
                        <div className="text-primary mb-2 flex justify-center">
                            {stat.icon}
                        </div>
                        <h3 className="text-lg font-semibold mb-3">
                            {stat.label}
                        </h3>
                        <div className="flex justify-around mt-4">
                            <div>
                                <div className="text-xl font-bold text-primary">
                                    {stat.thisWeek}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {stat.weekLabel}
                                </div>
                            </div>
                            <div>
                                <div className="text-xl font-bold text-secondary-foreground">
                                    {stat.allTime}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {stat.allTimeLabel}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
    </div>
};
