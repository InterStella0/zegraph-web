'use client'
import {useMemo} from "react";
import dayjs from "lib/dayjs";
import { AlertTriangle } from "lucide-react";
import {formatHours, formatNumber, REGION_COLORS} from "utils/generalUtils.ts";
import {useMapResource} from "lib/hooks/useMapScope";
import {DailyMapRegion} from "types/maps.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import {useTranslations, useLocale} from 'next-intl';
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import {weekdayKey} from "lib/calendarHeatmap";
import MapCardTitle from "components/maps/MapCardTitle";
import {withMapSuspense} from "components/maps/withMapSuspense";
import MapDailyHeatmap, {HeatDay} from "components/maps/MapDailyHeatmap";

const REGION_ORDER = Object.keys(REGION_COLORS)
const regionColor = (region: string | undefined) => (REGION_COLORS as Record<string, string>)[region] ?? 'grey'
const regionAlpha = (hours: number, hasData: boolean): [number, number] =>
    [hasData ? Math.min(1, Math.max(0.15, (.01 + hours) / 3)) : .01 / 3, (1 + hours) / 4]
const formatMinutes = (seconds: number) => `${(seconds / 60).toFixed(2)}mins`
const largest = (totals: Map<string, number>) => [...totals.entries()].sort((a, b) => b[1] - a[1])[0]

type MapHeatRegionProps = { initialDataPromise?: Promise<DailyMapRegion[] | null> }

function MapHeatRegionDisplay({ initialDataPromise }: MapHeatRegionProps){
    const t = useTranslations('maps.heatRegion');
    const tRegion = useTranslations('maps.regionDistribution');
    const locale = useLocale();
    const dayNames = useWeekdayLabels();
    const { data, loading, error, notReady } = useMapResource<DailyMapRegion[]>('/heat-regions', initialDataPromise)

    const days = useMemo<HeatDay[]>(() => (data ?? []).map(day => ({
        date: day.date,
        series: day.regions.map(e => ({key: e.region_name, label: e.region_name, seconds: e.total_play_duration})),
    })), [data])

    const summary = useMemo(() => {
        if (!data || data.length === 0) {
            return t('noData');
        }

        const dayTotals = new Map<string, number>();
        const regionTotals = new Map<string, number>();
        for (const day of data) {
            const weekday = weekdayKey(dayjs.utc(day.date));
            dayTotals.set(weekday, (dayTotals.get(weekday) || 0) + day.regions.reduce((p, c) => p + c.total_play_duration, 0));
            for (const region of day.regions)
                regionTotals.set(region.region_name, (regionTotals.get(region.region_name) || 0) + region.total_play_duration);
        }
        const mostActiveDay = largest(dayTotals);
        const mostActiveRegion = largest(regionTotals);
        const uniqueDays = new Set(data.map(day => dayjs.utc(day.date).format("YYYY-MM-DD"))).size;

        return t('summary', {
            days: formatNumber(uniqueDays, 0, locale),
            day: dayNames[mostActiveDay[0]] ?? mostActiveDay[0],
            dayHours: formatHours(mostActiveDay[1], locale),
            region: mostActiveRegion[0],
            regionHours: formatHours(mostActiveRegion[1], locale)
        });
    }, [data, dayNames]);

    return (
        <div className="p-4">
            <MapCardTitle
                className=""
                titleClassName="text-xl"
                title={t('title')}
                tooltip={error ? (notReady ? t('dataNotReady') : t('somethingWrong')) : t('tooltip')}
                icon={error ? <AlertTriangle className="h-4 w-4" /> : undefined}
            />

            {!loading && days.length > 0 && (
                <ScreenReaderOnly id="heat-region-summary">
                    {summary}
                </ScreenReaderOnly>
            )}

            <div
                className="p-4 flex justify-center md:justify-center sm:justify-end xs:justify-end items-center overflow-auto"
                role="img"
                aria-label={t('ariaLabel')}
                aria-describedby="heat-region-summary"
            >
                <MapDailyHeatmap
                    days={days}
                    loading={loading}
                    colorOf={regionColor}
                    order={REGION_ORDER}
                    cellAlpha={regionAlpha}
                    yTitle={tRegion('hours')}
                    formatValue={formatMinutes}
                />
            </div>
        </div>
    )
}
export default withMapSuspense(MapHeatRegionDisplay, t => t('maps.heatRegion.loadError'))
