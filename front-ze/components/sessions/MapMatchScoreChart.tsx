'use client'
import {useTranslations} from 'next-intl';
import { useMemo } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from 'components/ui/card';
import { LazyLineChart as Line } from 'components/graphs/LazyCharts';
import { getMatchScoreChartData, getChartOptionsWithAnnotations, getRoundChangeAnnotations } from 'utils/sessionUtils.js';
import { MapSessionMatch, ServerMapPlayed } from "types/maps";
import { Chart as ChartJS } from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";

ChartJS.register(annotationPlugin);

export default function MapMatchScoreChart(
    { sessionInfo, graphMatch }:
    { sessionInfo: ServerMapPlayed, graphMatch: MapSessionMatch[] }
) {
    const t = useTranslations('sessions');
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const roundAnnotations = useMemo(
        () => getRoundChangeAnnotations(graphMatch, sessionInfo, isDark),
        [graphMatch, sessionInfo, isDark]
    );

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>{t('matchScoreProgression')}</CardTitle>
                <CardDescription>
                    {t('roundByRoundFor', {map: sessionInfo.map})}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px]">
                    <Line
                        data={getMatchScoreChartData(graphMatch, "map")}
                        // @ts-ignore
                        options={getChartOptionsWithAnnotations(null, sessionInfo, true, 5, isDark, roundAnnotations)}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
