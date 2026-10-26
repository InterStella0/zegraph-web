import {ReactNode} from "react";
import {useTranslations} from 'next-intl';
import { Card, CardContent } from 'components/ui/card';
import { formatDuration, getServerPopRange } from 'utils/sessionUtils.js';
import dayjs from "lib/dayjs";
import { PlayerSession} from "types/players";
import {
    MutualSessionReturn, PlayerSessionMapPlayed, ServerGraphType
} from "../../app/servers/[server_slug]/util";

export function SessionStatGrid({ stats }: { stats: [ReactNode, ReactNode][] }) {
    return (
        <Card className="mb-6">
            <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                    {stats.map(([value, label], index) => (
                        <div key={index} className="text-center">
                            <div className="text-3xl md:text-4xl font-bold mb-1">
                                {value}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {label}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export function SessionStats({ sessionInfo, maps, mutualSessions, serverGraph }
    :{ sessionInfo: PlayerSession, maps: PlayerSessionMapPlayed[], serverGraph: ServerGraphType<"player">, mutualSessions: MutualSessionReturn<"player">,  }
) {
    const t = useTranslations('sessions');
    return <SessionStatGrid stats={[
        [formatDuration(sessionInfo.started_at, sessionInfo.ended_at || dayjs()), <>{sessionInfo.ended_at ? 'Total' : 'Current'} Duration</>],
        [maps.length, t('mapsPlayed')],
        [mutualSessions.length, t('mutualSessions')],
        [getServerPopRange(serverGraph), t('serverPopRange')],
    ]} />;
};
