'use client'
import {useTranslations} from 'next-intl';
import { useTheme } from 'next-themes';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from 'components/ui/card';
import { LazyLineChart as Line } from 'components/graphs/LazyCharts';
import { getMatchScoreChartData, getChartOptionsWithAnnotations } from 'utils/sessionUtils.js';
import {PlayerSession} from "types/players.js";
import {PlayerSessionMapPlayed} from "../../app/servers/[server_slug]/util.js";
import {
    BarElement,
    CategoryScale,
    Chart as ChartJS, Legend,
    LinearScale,
    LineController,
    LineElement,
    PointElement, TimeScale,
    Title,
    Tooltip
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import { useMemo } from "react";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { formatNumber } from "utils/generalUtils";

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, LineController,
    Title, Tooltip, Legend, TimeScale, annotationPlugin, BarElement,
);

export default function MatchScoreChart(
    {sessionInfo, maps}
    : {sessionInfo: PlayerSession, maps: PlayerSessionMapPlayed[]}
) {
    const t = useTranslations('sessions');
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    // Generate SEO summary
    const summary = useMemo(() => {
        if (!maps || maps.length === 0) {
            return t('noMatchScoreData');
        }

        let totalRounds = 0;
        let zombieWins = 0;
        let humanWins = 0;

        maps.forEach(map => {
            if (map.match_data) {
                map.match_data.forEach(match => {
                    totalRounds++;
                    if (match.zombie_score > match.human_score) {
                        zombieWins++;
                    } else if (match.human_score > match.zombie_score) {
                        humanWins++;
                    }
                });
            }
        });

        const ties = totalRounds - zombieWins - humanWins;

        return `Match scores across ${formatNumber(maps.length)} map${maps.length !== 1 ? 's' : ''} and ${formatNumber(totalRounds)} round${totalRounds !== 1 ? 's' : ''}. ` +
            `Zombie wins: ${formatNumber(zombieWins)}, Human wins: ${formatNumber(humanWins)}` +
            (ties > 0 ? `, Ties: ${formatNumber(ties)}` : '') + '.';
    }, [maps]);

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>{t('matchScoreProgression')}</CardTitle>
                <CardDescription>
                    {t('roundByRound')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ScreenReaderOnly id="match-score-summary">
                    {summary}
                </ScreenReaderOnly>
                <div
                    className="h-[300px]"
                    role="img"
                    aria-label={t('matchScoreProgression')}
                    aria-describedby="match-score-summary"
                >
                    <Line
                        data={getMatchScoreChartData(maps, "player")}
                        // @ts-ignore
                        options={getChartOptionsWithAnnotations(maps, sessionInfo, true, 5, isDark)}
                    />
                </div>
            </CardContent>
        </Card>
    );
};
