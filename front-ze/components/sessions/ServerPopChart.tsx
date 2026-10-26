'use client'
import {useTranslations} from 'next-intl';
import { useTheme } from 'next-themes';
import { LazyLineChart as Line } from 'components/graphs/LazyCharts';
import { getServerPopChartData, getChartOptionsWithAnnotations } from 'utils/sessionUtils.js';
import {
    PlayerSessionMapPlayed,
    ServerGraphType, SessionInfo, SessionType
} from "../../app/servers/[server_slug]/util";
import { formatNumber } from "utils/generalUtils";
import {useMemo} from "react";
import {SessionChartCard} from "./SessionLayout";

export function ServerPopChart<T extends SessionType>(
    { sessionInfo, serverGraph, maps }:
    { sessionInfo: SessionInfo<T>, serverGraph: ServerGraphType<T>, maps: PlayerSessionMapPlayed[] | null }
) {
    const t = useTranslations('sessions');
    const isDark = useTheme().resolvedTheme === 'dark';
    const data = useMemo(() => getServerPopChartData(serverGraph, isDark), [serverGraph, isDark]);

    let summary = t('noServerPopData');
    if (serverGraph?.length) {
        const playerCounts = serverGraph.map(d => d.player_count);
        const average = playerCounts.reduce((sum, count) => sum + count, 0) / playerCounts.length;
        const mapInfo = maps?.length ? ` across ${formatNumber(maps.length)} map${maps.length !== 1 ? 's' : ''}` : '';
        summary = `Session population data${mapInfo}. Peak: ${formatNumber(Math.max(...playerCounts))} players, ` +
            `Average: ${formatNumber(Math.round(average))} players, Minimum: ${formatNumber(Math.min(...playerCounts))} players. ` +
            `Total data points: ${formatNumber(serverGraph.length)}.`;
    }

    return (
        <SessionChartCard title={t('serverPopTitle')} description={t('serverPopSubtitle')} summaryId="server-pop-summary" summary={summary}>
            <Line
                data={data}
                // @ts-ignore
                options={getChartOptionsWithAnnotations(maps, sessionInfo, false, 64, isDark)}
            />
        </SessionChartCard>
    );
}
