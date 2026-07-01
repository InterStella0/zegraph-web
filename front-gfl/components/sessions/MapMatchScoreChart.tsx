'use client'
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
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const roundAnnotations = useMemo(
        () => getRoundChangeAnnotations(graphMatch, sessionInfo, isDark),
        [graphMatch, sessionInfo, isDark]
    );

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>Match Score Progression</CardTitle>
                <CardDescription>
                    Round-by-round score tracking for {sessionInfo.map}
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
