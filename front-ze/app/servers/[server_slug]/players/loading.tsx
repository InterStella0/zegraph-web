import { ReactNode, Suspense } from "react";
import { useTranslations } from "next-intl";
import { AdSpot } from "components/ui/AdSpot";
import { StatsCardsLoading } from "components/players/StatsCards";
import { PlayerRankingsLoading } from "components/players/PlayerRankings";
import { TopPerformersLoading } from "components/players/TopPerformers";
import { PlayersOnlineLoading } from "components/players/PlayersOnline.tsx";
import { PlayerByCountriesLoading } from "components/players/PlayerByCountries.tsx";

// Without content (the loading screen) a section is just its skeleton: a Suspense around the skeleton itself
// would stream every skeleton twice.
const section = (content: ReactNode, loading: ReactNode) => content ? <Suspense fallback={loading}>{content}</Suspense> : loading;

/** The players page layout; each section streams in behind its skeleton, which is all the loading screen shows. */
export function PlayersLayout({ stats, main, side }: { stats?: ReactNode, main?: ReactNode, side?: ReactNode }) {
    const t = useTranslations('players.page');
    const statsLoading = <StatsCardsLoading />;
    const mainLoading = <><PlayerRankingsLoading /><TopPerformersLoading /></>;
    const sideLoading = <><PlayersOnlineLoading /><PlayerByCountriesLoading /></>;
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

            {section(stats, statsLoading)}

            <AdSpot className="my-6" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">
                    {section(main, mainLoading)}
                </div>
                <div className="lg:col-span-4 space-y-6">
                    {section(side, sideLoading)}
                </div>
            </div>
        </div>
    );
}

export default function Loading() {
    return <PlayersLayout />;
}
