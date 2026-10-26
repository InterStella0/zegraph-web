import {ReactElement, ReactNode} from 'react';
import { User, Globe, Clock } from 'lucide-react';
import { secondsToHours } from "utils/generalUtils";
import { getCachedPlayerStats } from "lib/cachedFetches";
import { PlayersStatistic, ServerPlayersStatistic } from "types/players.ts";
import {ServerSlugPromise} from "../../app/servers/[server_slug]/util.ts";
import { Card, CardContent } from "components/ui/card";
import { getTranslations, getLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { SkeletonText } from "components/ui/skeleton";

type Period = PlayersStatistic | undefined;

const CARDS = [
    { key: 'totalPlayers', icon: User, format: (p: Period, locale: string) => p?.total_players?.toLocaleString(locale) || '0' },
    { key: 'cumulativeHours', icon: Clock, format: (p: Period, locale: string) => secondsToHours(p?.total_cum_playtime || 0, locale) },
    { key: 'countries', icon: Globe, format: (p: Period) => p?.countries?.toString() || '0' },
];

function StatsCardsGrid({ t, cards = CARDS, value }: {
    t: (key: string) => string,
    cards?: typeof CARDS,
    value: (card: typeof CARDS[number], period: keyof ServerPlayersStatistic) => ReactNode,
}) {
    return <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {cards.map(card => (
            <Card key={card.key} className="h-full">
                <CardContent className="text-center py-4 px-4">
                    <div className="text-primary mb-2 flex justify-center">
                        <card.icon className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-semibold mb-3">
                        {t(card.key)}
                    </h3>
                    <div className="flex justify-around mt-4">
                        <div>
                            <div className="text-xl font-bold text-primary">
                                {value(card, 'week1')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {t('thisWeek')}
                            </div>
                        </div>
                        <div>
                            <div className="text-xl font-bold text-secondary-foreground">
                                {value(card, 'all_time')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {t('allTime')}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        ))}
    </div>
}

export default async function StatsCards({ serverPromise }: {serverPromise: ServerSlugPromise}): Promise<ReactElement> {
    const server = await serverPromise
    const stats: ServerPlayersStatistic = await getCachedPlayerStats(server.id);
    const t = await getTranslations('players.statsCards');
    const locale = await getLocale();

    return <StatsCardsGrid t={t} cards={stats ? CARDS : []} value={(card, period) => card.format(stats[period], locale)} />
}

export function StatsCardsLoading() {
    const t = useTranslations('players.statsCards');
    return <StatsCardsGrid t={t} value={() => <SkeletonText className="h-5 w-16" />} />
}
