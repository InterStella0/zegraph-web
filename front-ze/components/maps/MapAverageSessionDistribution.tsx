'use client'
import {LazyBarChart as Bar} from "components/graphs/LazyCharts";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import SkeletonBarGraph from "../graphs/SkeletonBarGraph.tsx";
import {useMapResource} from "lib/hooks/useMapScope";
import {MapSessionDistribution} from "types/maps.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizeSessionDistribution } from "utils/chartSeoUtils.tsx";
import {useTranslations} from 'next-intl';
import {heatmapTooltip, useChartTheme} from "lib/chartTheme";
import MapCardTitle from "components/maps/MapCardTitle";
import {withMapSuspense} from "components/maps/withMapSuspense";

const BAR_HUES = ['221.2, 83.2%, 53.3%', '262.1, 83.3%, 57.8%', '291.7, 66.7%, 64.7%', '24.6, 95%, 53.1%', '346.8, 77.2%, 49.8%'];
const BAR_BACKGROUNDS = BAR_HUES.map(hue => `hsla(${hue}, 0.7)`);
const BAR_BORDERS = BAR_HUES.map(hue => `hsl(${hue})`);

type MapAverageSessionDistributionProps = { initialDataPromise?: Promise<MapSessionDistribution[] | null> }

function AverageSessionDistribution({ initialDataPromise }: MapAverageSessionDistributionProps) {
    const t = useTranslations('maps.sessionDistribution');
    const colors = useChartTheme();
    const { data: detail, loading, error } = useMapResource<MapSessionDistribution[]>('/sessions_distribution', initialDataPromise);
    const totalSessions = detail?.reduce((sum, d) => sum + d.session_count, 0) || 0;
    const axis = { color: colors.foreground, font: { weight: 'bold' } };
    const labels = {
        "Under 10": t('under10'),
        "10 - 30": t('range10to30'),
        "30 - 45": t('range30to45'),
        "45 - 60": t('range45to60'),
        "Over 60": t('over60')
    };

    const data = {
        labels: Object.values(labels),
        datasets: [{
            axis: 'y',
            data: Object.keys(labels).map(e => detail?.find(d => d.session_range === e)?.session_count ?? 0),
            fill: false,
            backgroundColor: BAR_BACKGROUNDS,
            borderColor: BAR_BORDERS,
            borderWidth: 1,
            borderRadius: 4,
            barThickness: 25,
            label: t('numberOfSessions')
        }]
    };

    const options: any = {
        indexAxis: 'y',
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                ...heatmapTooltip(colors),
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 },
                padding: 10,
                cornerRadius: 4
            }
        },
        scales: {
            x: { grid: { color: colors.faintGrid }, ticks: axis },
            y: { grid: { display: false }, ticks: axis }
        }
    };

    const summary = !detail || detail.length === 0 ? t('noData') : summarizeSessionDistribution(detail.map(d => ({
        range: labels[d.session_range],
        count: d.session_count,
        percentage: (d.session_count / totalSessions) * 100
    })));

    if (error) {
        return (
            <Card className="p-6 rounded-lg h-[300px] flex items-center justify-center">
                <p className="text-destructive">{error.message || t('somethingWrong')}</p>
            </Card>
        );
    }

    return (
        <Card className="p-6 rounded-lg transition-transform duration-300">
            <MapCardTitle title={t('title')} tooltip={t('tooltip')} />

            {!loading && detail && detail.length > 0 && (
                <ScreenReaderOnly id="session-distribution-summary">
                    {summary}
                </ScreenReaderOnly>
            )}

            {loading ? (
                <div className="h-[300px] flex items-center overflow-hidden">
                    <SkeletonBarGraph height={200} amount={5} barHeight={23} width={400} gap={'1.3rem'} />
                </div>
            ) : (
                <div
                    className="h-[300px]"
                    role="img"
                    aria-label={t('title')}
                    aria-describedby="session-distribution-summary"
                >
                    <Bar data={data} options={options}/>
                </div>
            )}

            <div className="mt-4 flex justify-end">
                {loading ? (
                    <div className="flex items-center gap-1">
                        <p className="text-sm text-muted-foreground">
                            {t('totalSessionsLabel')}
                        </p>
                        <Skeleton className="w-8 h-4" />
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('totalSessions', {count: totalSessions})}
                    </p>
                )}
            </div>
        </Card>
    );
}

export default withMapSuspense(AverageSessionDistribution, t => t('maps.sessionDistribution.loadError'))
