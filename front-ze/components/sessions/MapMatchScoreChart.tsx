'use client'
import {useTranslations} from 'next-intl';
import { useTheme } from 'next-themes';
import { LazyLineChart as Line } from 'components/graphs/LazyCharts';
import { getMatchScoreChartData, getChartOptionsWithAnnotations, getRoundChangeAnnotations } from 'utils/sessionUtils.js';
import { MapSessionMatch, ServerMapPlayed } from "types/maps";
import {SessionChartCard} from "./SessionLayout";

export default function MapMatchScoreChart(
    { sessionInfo, graphMatch }:
    { sessionInfo: ServerMapPlayed, graphMatch: MapSessionMatch[] }
) {
    const t = useTranslations('sessions');
    const isDark = useTheme().resolvedTheme === 'dark';
    const roundAnnotations = getRoundChangeAnnotations(graphMatch, sessionInfo, isDark);

    return (
        <SessionChartCard title={t('matchScoreProgression')} description={t('roundByRoundFor', {map: sessionInfo.map})}>
            <Line
                data={getMatchScoreChartData(graphMatch)}
                // @ts-ignore
                options={getChartOptionsWithAnnotations(null, sessionInfo, true, 5, isDark, roundAnnotations)}
            />
        </SessionChartCard>
    );
}
