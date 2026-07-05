import {useTranslations} from 'next-intl';
import { Card, CardContent } from 'components/ui/card';
import { formatDuration, getServerPopRange } from 'utils/sessionUtils.js';
import dayjs from "dayjs";
import { MapSessionMatch, ServerMapPlayed } from "types/maps";
import { MutualSessionReturn, ServerGraphType } from "../../app/servers/[server_slug]/util";

export default function MapSessionStats(
    { sessionInfo, serverGraph, graphMatch, mutualSessions }:
    { sessionInfo: ServerMapPlayed, serverGraph: ServerGraphType<"map">, graphMatch: MapSessionMatch[], mutualSessions: MutualSessionReturn<"map"> }
) {
    const t = useTranslations('sessions');
    const final = graphMatch[graphMatch.length - 1] || null
    const finalScore = final ? `${final.human_score}-${final.zombie_score}` : '?-?'

    return (
        <Card className="mb-6">
            <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                    <div className="text-center">
                        <div className="text-3xl md:text-4xl font-bold mb-1">
                            {formatDuration(sessionInfo.started_at, sessionInfo.ended_at || dayjs())}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {sessionInfo.ended_at ? 'Total' : 'Current'} Duration
                        </div>
                    </div>

                    <div className="text-center">
                        <div className="text-3xl md:text-4xl font-bold mb-1">
                            {finalScore}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {t('matchScore')}
                        </div>
                    </div>

                    <div className="text-center">
                        <div className="text-3xl md:text-4xl font-bold mb-1">
                            {mutualSessions.length}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {t('totalPlayers')}
                        </div>
                    </div>

                    <div className="text-center">
                        <div className="text-3xl md:text-4xl font-bold mb-1">
                            {getServerPopRange(serverGraph)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {t('serverPopRange')}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
