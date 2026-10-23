import {useState, useContext, useMemo} from 'react';
import { ChevronDown, ChevronUp, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import {useTranslations} from 'next-intl';
import { TemporalContext, TemporalData } from "./TemporalController.tsx";
import {useReactControl} from "./leafletControls";
import {fetchUrl, getFlagUrl, intervalToServer, range} from "utils/generalUtils.ts";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/ui/tooltip";
import { Button } from "components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/ui/collapsible";
import { cn } from "components/lib/utils";
import { Skeleton } from "components/ui/skeleton";
import {withErrorCatch} from "components/common/withErrorCatch";
import {useResource} from "lib/hooks/useResource";
import {useDebounced} from "lib/hooks/useDebounced";
import {useMediaQuery} from "lib/hooks/useMediaQuery";

const PAGE_SIZE = 5;
const NO_STATS = { in_view_count: 0, total_count: 0, countries: [] };

function fetchStats(serverId, start, interval, isLive){
    if (isLive)
        return fetchUrl(`/radars/${serverId}/live_statistics`)

    return fetchUrl(`/radars/${serverId}/statistics`, {params: { time: start.toISOString(), interval: intervalToServer(interval) }})
}

function CountryStatsList({ temporal, serverId }: { temporal: TemporalData, serverId: string }) {
    const t = useTranslations('radar');
    const [page, setPage] = useState(1);
    const [isExpanded, setIsExpanded] = useState(true);
    const isMobile = useMediaQuery('(max-width: 639px)');
    const { cursor, interval, isLive } = temporal
    const { data, loading } = useResource(
        () => (cursor && interval) || isLive ? fetchStats(serverId, cursor, interval, isLive) : null,
        [serverId, cursor, interval, isLive],
        { keepData: true },
    );
    const stats = data ?? NO_STATS;
    const totalPages = Math.ceil(stats.countries.length / PAGE_SIZE);
    const currentCountries = stats.countries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <Collapsible
            open={isExpanded}
            onOpenChange={setIsExpanded}
            className={cn(
                "backdrop-blur-md rounded overflow-hidden shadow-md transition-all duration-300 border",
                "bg-background/80 dark:bg-background/70 border-border/40 hover:shadow-lg max-w-[250px]",
                isExpanded ? (isMobile ? "w-[120px]" : "w-[250px]") : "w-[80px]",
            )}
        >
            <Tooltip>
                <TooltipTrigger asChild>
                    <CollapsibleTrigger asChild>
                        <div className={cn("flex items-center justify-between p-3 cursor-pointer gap-2", isExpanded && "border-b border-border/40")}>
                            <Users className="h-5 w-5" />
                            {isExpanded && !isMobile && (
                                <span className="text-sm font-semibold flex-1">{t('playerDistribution')}</span>
                            )}
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        </div>
                    </CollapsibleTrigger>
                </TooltipTrigger>
                {!isExpanded && !isMobile && (
                    <TooltipContent>{t('playerDistribution')}</TooltipContent>
                )}
            </Tooltip>

            <CollapsibleContent>
                <div className="p-3">
                    <div className={cn("flex items-center mb-3 pb-2 border-b border-border/20", isMobile ? "justify-center" : "justify-between")}>
                        {!isMobile && (
                            <span className="text-xs text-muted-foreground">{t('playersOnMap')}</span>
                        )}
                        <span className="text-xs font-semibold">
                            <span title={t('publicLocation')}>{stats.in_view_count} </span>
                            / <span title={t('totalTimeframe')}>{stats.total_count}</span>
                        </span>
                    </div>

                    {loading ? (
                        <>
                            <div className="space-y-2">
                                {range(PAGE_SIZE).map(i => <Skeleton key={i} className="h-[26px] w-full" />)}
                            </div>
                            <Skeleton className="h-6 w-full mt-2" />
                        </>
                    ) : (
                        <>
                            <ul className="space-y-2">
                                {currentCountries.map((country) => (
                                    <li key={country.code} className="flex justify-between items-center py-1">
                                        <div className="flex items-center">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="flex items-center mr-2 w-6 h-[18px] overflow-hidden rounded shadow-sm">
                                                        <img src={getFlagUrl(country.code)} alt={country.name} className="w-full h-auto block" loading="lazy" />
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>{country.name}</TooltipContent>
                                            </Tooltip>
                                            {!isMobile && (
                                                <span className="text-xs text-muted-foreground max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                                                    {country.name}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs font-semibold">{country.count}</span>
                                    </li>
                                ))}
                            </ul>

                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-1 mt-2">
                                    <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                                        <ChevronLeft className="h-3 w-3" />
                                    </Button>

                                    {isMobile ? (
                                        <span className="text-xs px-2">{page}</span>
                                    ) : range(totalPages).map(i => (
                                        <Button
                                            key={i}
                                            variant={i + 1 === page ? "default" : "outline"}
                                            size="sm"
                                            className="h-6 min-w-6 px-2 text-xs"
                                            onClick={() => setPage(i + 1)}
                                        >
                                            {i + 1}
                                        </Button>
                                    ))}

                                    <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
                                        <ChevronRight className="h-3 w-3" />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

const SafeCountryStatsList = withErrorCatch(CountryStatsList, t => t('radar.statsError'));

export default function StatsComponent() {
    const { server } = useServerData()
    const { data } = useContext(TemporalContext)
    // Every cursor move would refetch, so the stats wait for the timeline to settle. TemporalController mutates
    // its state in place, so the debounced value is a copy that later moves can't reach.
    const temporal = useDebounced(useMemo(() => ({...data}), [data]), 600)
    useReactControl(<SafeCountryStatsList temporal={temporal} serverId={server.id} />, 'topright', 'leaflet-bar');
    return null;
}
