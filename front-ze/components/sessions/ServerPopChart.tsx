'use client'
import {useTranslations} from 'next-intl';
import { useTheme } from 'next-themes';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from 'components/ui/card';
import { LazyLineChart as Line } from 'components/graphs/LazyCharts';
import { getServerPopChartData, getChartOptionsWithAnnotations } from 'utils/sessionUtils.js';
import {
    PlayerSessionMapPlayed,
    ServerGraphType, SessionInfo, SessionType
} from "../../app/servers/[server_slug]/util";
import {
    Chart as ChartJS, Filler,
    Legend,
    LinearScale, LineElement, PointElement, TimeScale,
    Title,
    Tooltip
} from "chart.js";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import {useMemo} from "react";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { formatNumber } from "utils/generalUtils";

ChartJS.register(
    LinearScale,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    PointElement,
    LineElement,
    Filler,
)

export function ServerPopChart<T extends SessionType>(
    { sessionInfo, serverGraph, maps }:
    { sessionInfo: SessionInfo<T>, serverGraph: ServerGraphType<T>, maps: PlayerSessionMapPlayed[] | null }
) {
    const t = useTranslations('sessions');
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const data = useMemo(() => getServerPopChartData(serverGraph, isDark), [isDark])

    const summary = useMemo(() => {
        if (!serverGraph || serverGraph.length === 0) {
            return t('noServerPopData');
        }

        const playerCounts = serverGraph.map(d => d.player_count);
        const peakPlayers = Math.max(...playerCounts);
        const avgPlayers = playerCounts.reduce((sum, count) => sum + count, 0) / playerCounts.length;
        const minPlayers = Math.min(...playerCounts);

        let mapInfo = "";
        if (maps && maps.length > 0) {
            mapInfo = ` across ${formatNumber(maps.length)} map${maps.length !== 1 ? 's' : ''}`;
        }

        return `Session population data${mapInfo}. Peak: ${formatNumber(peakPlayers)} players, ` +
            `Average: ${formatNumber(Math.round(avgPlayers))} players, Minimum: ${formatNumber(minPlayers)} players. ` +
            `Total data points: ${formatNumber(serverGraph.length)}.`;
    }, [serverGraph, maps]);

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>{t('serverPopTitle')}</CardTitle>
                <CardDescription>{t('serverPopSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
                <ScreenReaderOnly id="server-pop-summary">
                    {summary}
                </ScreenReaderOnly>
                <div
                    className="h-[300px]"
                    role="img"
                    aria-label={t('serverPopTitle')}
                    aria-describedby="server-pop-summary"
                >
                    <Line
                        data={data}
                        // @ts-ignore
                        options={getChartOptionsWithAnnotations(maps, sessionInfo, false, 64, isDark)}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
