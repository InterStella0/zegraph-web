'use client'
import {use, useMemo} from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { AlertTriangle } from "lucide-react";
import { TooltipProvider } from "../ui/tooltip";
import {fetchServerUrl, formatHours, formatNumber, REGION_COLORS} from "utils/generalUtils.ts";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {PeriodChip, usePeriod} from "components/period/Period";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useResource} from "lib/hooks/useResource";
import {DailyMapRegion} from "types/maps.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import {useTranslations, useLocale} from 'next-intl';
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import {weekdayKey} from "lib/calendarHeatmap";
import InfoTooltip from "components/common/InfoTooltip";
import {withMapSuspense} from "components/maps/withMapSuspense";
import MapDailyHeatmap, {HeatDay} from "components/maps/MapDailyHeatmap";

dayjs.extend(utc);

type HeatRegionData = {
    x: string,
    y: string,
    d: string,
    v: DailyMapRegion,
}

function toHeatRegionData(resp: DailyMapRegion[]): HeatRegionData[] {
    return resp.map(e => {
        const dt = dayjs.utc(e.date)
        const iso = dt.format("YYYY-MM-DD")
        return {
            x: iso,
            y: weekdayKey(dt),
            d: iso,
            v: e
        }
    })
}

const REGION_ORDER = Object.keys(REGION_COLORS)
const regionColor = (region: string | undefined) => (REGION_COLORS as Record<string, string>)[region] ?? 'grey'
const regionAlpha = (hours: number, hasData: boolean): [number, number] =>
    [hasData ? Math.min(1, Math.max(0.15, (.01 + hours) / 3)) : .01 / 3, (1 + hours) / 4]
const formatMinutes = (seconds: number) => `${(seconds / 60).toFixed(2)}mins`

type MapHeatRegionProps = { initialDataPromise?: Promise<DailyMapRegion[] | null> }

function MapHeatRegionDisplay({ initialDataPromise }: MapHeatRegionProps){
    const t = useTranslations('maps.heatRegion');
    const tRegion = useTranslations('maps.regionDistribution');
    const locale = useLocale();
    const { name } = useMapContext()
    const { period } = usePeriod()
    const initialData = initialDataPromise ? use(initialDataPromise) : null
    const {server} = useServerData()
    const server_id = server.id
    const initialRegions = useMemo(() => initialData ? toHeatRegionData(initialData) : undefined, [initialData])
    const { data: fetched, loading, error, notReady } = useResource<HeatRegionData[]>(() => name
        ? fetchServerUrl(server_id, `/maps/${name}/heat-regions`, period ? { params: { period } } : {}).then(toHeatRegionData)
        : null, [server_id, name, period], { initial: initialRegions, retryNotReady: true })
    const regions = fetched ?? []

    const dayNames = useWeekdayLabels();

    const days = useMemo<HeatDay[]>(() => regions.map(r => ({
        date: r.v.date,
        series: r.v.regions.map(e => ({key: e.region_name, label: e.region_name, seconds: e.total_play_duration})),
    })), [regions])

    const summary = useMemo(() => {
        if (!regions || regions.length === 0) {
            return t('noData');
        }

        const dayTotals = new Map<string, number>();
        regions.forEach(r => {
            const current = dayTotals.get(r.y) || 0;
            dayTotals.set(r.y, current + r.v.regions.reduce((p, c) => p + c.total_play_duration, 0));
        });

        const mostActiveDay = Array.from(dayTotals.entries())
            .sort((a, b) => b[1] - a[1])[0];

        const regionTotals = new Map<string, number>();
        regions.forEach(r => {
            for (const region of r.v.regions){
                const current = regionTotals.get(region.region_name) || 0;
                regionTotals.set(region.region_name, current + region.total_play_duration);
            }
        });

        const mostActiveRegion = Array.from(regionTotals.entries())
            .sort((a, b) => b[1] - a[1])[0];

        const uniqueDays = new Set(regions.map(r => r.x)).size;

        return t('summary', {
            days: formatNumber(uniqueDays, 0, locale),
            day: dayNames[mostActiveDay[0]] ?? mostActiveDay[0],
            dayHours: formatHours(mostActiveDay[1], locale),
            region: mostActiveRegion[0],
            regionHours: formatHours(mostActiveRegion[1], locale)
        });
    }, [regions, dayNames]);

    return (
        <div className="p-4">
            <div className="flex justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-primary">
                        {t('title')}
                    </h2>
                    <PeriodChip />
                </div>
                <div>
                    <TooltipProvider>
                        <InfoTooltip text={error ? (notReady ? t('dataNotReady') : t('somethingWrong')) : t('tooltip')} icon={error ? <AlertTriangle className="h-4 w-4" /> : undefined} />
                    </TooltipProvider>
                </div>
            </div>

            {!loading && regions.length > 0 && (
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