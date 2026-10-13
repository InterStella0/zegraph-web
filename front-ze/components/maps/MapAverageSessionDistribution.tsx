'use client'
import {use, useEffect, useMemo, useRef, useState} from "react";
import {fetchServerUrl, StillCalculate} from "utils/generalUtils.ts";
import {LazyBarChart as Bar} from "components/graphs/LazyCharts";
import { Card } from "../ui/card";
import { TooltipProvider } from "../ui/tooltip";
import { Skeleton } from "../ui/skeleton";
import SkeletonBarGraph from "../graphs/SkeletonBarGraph.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {PeriodChip, usePeriod} from "components/period/Period";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useNotReadyRetry} from "lib/hooks/useNotReadyRetry";
import {MapSessionDistribution} from "types/maps.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizeSessionDistribution } from "utils/chartSeoUtils.tsx";
import {useTranslations} from 'next-intl';
import {heatmapTooltip, useChartTheme} from "lib/chartTheme";
import InfoTooltip from "components/common/InfoTooltip";
import {withMapSuspense} from "components/maps/withMapSuspense";

const BAR_HUES = ['221.2, 83.2%, 53.3%', '262.1, 83.3%, 57.8%', '291.7, 66.7%, 64.7%', '24.6, 95%, 53.1%', '346.8, 77.2%, 49.8%'];
const BAR_BACKGROUNDS = BAR_HUES.map(hue => `hsla(${hue}, 0.7)`);
const BAR_BORDERS = BAR_HUES.map(hue => `hsl(${hue})`);

type MapAverageSessionDistributionProps = { initialDataPromise?: Promise<MapSessionDistribution[] | null> }

function AverageSessionDistribution({ initialDataPromise }: MapAverageSessionDistributionProps) {
    const t = useTranslations('maps.sessionDistribution');
    const { name } = useMapContext();
    const { period } = usePeriod();
    const initialData = initialDataPromise ? use(initialDataPromise) : null
    const [detail, setDetail] = useState<MapSessionDistribution[] | null>(initialData);
    const [loading, setLoading] = useState<boolean>(initialData === null);
    const isFirstRun = useRef(initialData !== null)
    const [error, setError] = useState<string | null>(null);
    const [notReady, setNotReady] = useState<boolean>(false);
    const { server } = useServerData()
    const server_id = server.id
    const [retryTick, setRetryTick] = useState(0)
    useNotReadyRetry(notReady, () => setRetryTick(t => t + 1))

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false
            return
        }
        if (!name) return
        setLoading(true)
        setDetail(null)
        setNotReady(false)
        fetchServerUrl(server_id, `/maps/${name}/sessions_distribution`, period ? { params: { period } } : {})
            .then((data: MapSessionDistribution[]) => {
                setDetail(data);
            })
            .catch(err => {
                setNotReady(err instanceof StillCalculate)
                setError(err.message || t('somethingWrong'));
            })
            .finally(() => setLoading(false))
    }, [server_id, name, period, retryTick]);

    const labels = {
        "Under 10": t('under10'),
        "10 - 30": t('range10to30'),
        "30 - 45": t('range30to45'),
        "45 - 60": t('range45to60'),
        "Over 60": t('over60')
    };

    const colors = useChartTheme();

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
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                ...heatmapTooltip(colors),
                titleFont: {
                    size: 14,
                    weight: 'bold'
                },
                bodyFont: {
                    size: 13
                },
                padding: 10,
                cornerRadius: 4
            }
        },
        scales: {
            x: {
                grid: {
                    color: colors.faintGrid
                },
                ticks: {
                    color: colors.foreground,
                    font: {
                        weight: 'bold'
                    }
                }
            },
            y: {
                grid: {
                    display: false
                },
                ticks: {
                    color: colors.foreground,
                    font: {
                        weight: 'bold'
                    }
                }
            }
        }
    };

    // Generate SEO summary
    const summary = useMemo(() => {
        if (!detail || detail.length === 0) {
            return t('noData');
        }

        // Transform data to match helper function interface
        const totalSessions = detail.reduce((sum, d) => sum + d.session_count, 0);
        const sessionBuckets = detail.map(d => ({
            range: labels[d.session_range],
            count: d.session_count,
            percentage: (d.session_count / totalSessions) * 100
        }));

        return summarizeSessionDistribution(sessionBuckets);
    }, [detail]);

    if (error) {
        return (
            <Card className="p-6 rounded-lg h-[300px] flex items-center justify-center">
                <p className="text-destructive">{error}</p>
            </Card>
        );
    }

    return (
        <Card className="p-6 rounded-lg transition-transform duration-300">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-primary">{t('title')}</h2>
                    <PeriodChip />
                </div>
                <TooltipProvider>
                    <InfoTooltip text={t('tooltip')} />
                </TooltipProvider>
            </div>

            {!loading && detail && detail.length > 0 && (
                <ScreenReaderOnly id="session-distribution-summary">
                    {summary}
                </ScreenReaderOnly>
            )}

            {loading && (
                <div className="h-[300px] flex items-center overflow-hidden">
                    <SkeletonBarGraph height={200} amount={5} barHeight={23} width={400} gap={'1.3rem'} />
                </div>
            )}

            {!loading && (
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
                {!loading && <p className="text-sm text-muted-foreground">
                    {t('totalSessions', {count: detail?.reduce((acc, curr) => acc + curr.session_count, 0) || 0})}
                </p>
                }
                {loading && <div className="flex items-center gap-1">
                    <p className="text-sm text-muted-foreground">
                        {t('totalSessionsLabel')}
                    </p>
                    <Skeleton className="w-8 h-4" />
                </div>}
            </div>

        </Card>
    );
}

export default withMapSuspense(AverageSessionDistribution, t => t('maps.sessionDistribution.loadError'))