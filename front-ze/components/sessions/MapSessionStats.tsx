import {useTranslations} from 'next-intl';
import { formatDuration, getServerPopRange } from 'utils/sessionUtils.js';
import dayjs from "dayjs";
import { MapSessionMatch, ServerMapPlayed } from "types/maps";
import { MutualSessionReturn, ServerGraphType } from "../../app/servers/[server_slug]/util";
import {SessionStatGrid} from "./SessionStats";

export default function MapSessionStats(
    { sessionInfo, serverGraph, graphMatch, mutualSessions }:
    { sessionInfo: ServerMapPlayed, serverGraph: ServerGraphType<"map">, graphMatch: MapSessionMatch[], mutualSessions: MutualSessionReturn<"map"> }
) {
    const t = useTranslations('sessions');
    const final = graphMatch[graphMatch.length - 1] || null
    const finalScore = final ? `${final.human_score}-${final.zombie_score}` : '?-?'

    return <SessionStatGrid stats={[
        [formatDuration(sessionInfo.started_at, sessionInfo.ended_at || dayjs()), sessionInfo.ended_at ? t('totalDuration') : t('currentDuration')],
        [finalScore, t('matchScore')],
        [mutualSessions.length, t('totalPlayers')],
        [getServerPopRange(serverGraph), t('serverPopRange')],
    ]} />;
}
