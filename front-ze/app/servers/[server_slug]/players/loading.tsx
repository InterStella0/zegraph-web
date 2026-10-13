import { useTranslations } from "next-intl";
import { AdSpot } from "components/ui/AdSpot";
import { StatsCardsLoading } from "components/players/StatsCards";
import { PlayerRankingsLoading } from "components/players/PlayerRankings";
import { TopPerformersLoading } from "components/players/TopPerformers";
import { PlayersOnlineLoading } from "components/players/PlayersOnline.tsx";
import { PlayerByCountriesLoading } from "components/players/PlayerByCountries.tsx";

export default function Loading() {
    const t = useTranslations('players.page');
    return (
        <div className="m-6 max-sm:m-1.5">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold mb-2">
                    {t('title')}
                </h1>
                <p className="text-lg text-muted-foreground">
                    {t('subtitle')}
                </p>
            </div>

            <StatsCardsLoading />

            <AdSpot className="my-6" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">
                    <PlayerRankingsLoading />
                    <TopPerformersLoading />
                </div>
                <div className="lg:col-span-4 space-y-6">
                    <PlayersOnlineLoading />
                    <PlayerByCountriesLoading />
                </div>
            </div>
        </div>
    );
}
