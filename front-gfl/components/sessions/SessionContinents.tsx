import {useTranslations} from 'next-intl';
import {Card, CardHeader, CardTitle, CardContent, CardDescription} from "components/ui/card";
import PlayerContinentCounter from "components/players/PlayerContinentCounter.tsx";
import RadarSessionPreview from "components/sessions/RadarSessionPreview.tsx";

export default function SessionContinents({ sessionInfo, continents }) {
    const t = useTranslations('sessions');
    return (
        <Card className="p-0 gap-0 overflow-hidden">
            <CardHeader className="px-5 pt-5">
                <CardTitle>{t('continentDistribution')}</CardTitle>
            </CardHeader>
            <CardDescription className="px-5 pt-0 mb-3">
                {t('continentSubtitle')}
            </CardDescription>
            <CardContent className="p-0">
                <div className="mx-5 mb-5">
                    <PlayerContinentCounter continentData={continents} truncate={6} />
                </div>
                <RadarSessionPreview start={sessionInfo.started_at} end={sessionInfo.ended_at} />
            </CardContent>
        </Card>
    );
}

