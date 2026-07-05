import {useState, useEffect, useContext, useRef, useDeferredValue} from 'react';
import { ChevronDown, ChevronUp, Users, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { createControlComponent } from '@react-leaflet/core';
import L, { Control, DomUtil } from 'leaflet';
import { TemporalContext } from "./TemporalController.tsx";
import ReactDOM from "react-dom/client";
import {fetchUrl, getFlagUrl, intervalToServer} from "utils/generalUtils.ts";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import { Button } from "components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/ui/collapsible";
import { cn } from "components/lib/utils";
import {useTranslations} from 'next-intl';

function CountryStatsWrapper({ setUpdateFn }) {
    const [data, setData] = useState({});
    useEffect(() => {
        setUpdateFn(setData);
    }, [setUpdateFn]);

    return <ErrorCatch message={data?.labels?.statsError ?? "Couldn't show country stats!"}>
        <CountryStatsList reactData={data} />
    </ErrorCatch>
}

const CountryStatsControl = Control.extend({
    options: {
        position: 'topright'
    },

    initialize: function(options) {
        L.Util.setOptions(this, options)
        this._container = null;
        this._setReactDataFn = () => {}
    },
    updateData: function(data){
        if (this._setReactDataFn) {
            this._setReactDataFn(data);
        }
    },
    onAdd: function() {
        // Create container for the control
        this._container = DomUtil.create('div', 'leaflet-control leaflet-bar country-stats-control');

        // Prevent map click events when interacting with the control
        L.DomEvent.disableClickPropagation(this._container);
        L.DomEvent.disableScrollPropagation(this._container);

        const reactRoot = ReactDOM.createRoot(this._container);
        reactRoot.render(<CountryStatsWrapper setUpdateFn={(fn) => {
            this._setReactDataFn = fn;
            fn({timeContext: this.options.timeContext, server_id: this.options.server_id, labels: this.options.labels})
        }} />);
        return this._container;
    },

    onRemove: function() {
        this._container = null;
    }
});

function fetchStats(server_id, start, interval, isLive){
    if (isLive)
        return fetchUrl(`/radars/${server_id}/live_statistics`)

    const intervalServer = intervalToServer(interval)
    return fetchUrl(`/radars/${server_id}/statistics`, {params:
            { time: start.toISOString(), interval: intervalServer}
    })
}

const CountryStatsList = ({ reactData }) => {
    const { timeContext, server_id, labels } = reactData || {}
    const [page, setPage] = useState(1);
    const [isExpanded, setIsExpanded] = useState(true);
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState({
        in_view_count: 0,
        total_count: 0,
        countries: []
    })
    const pageSize = 5;
    const [isMobile, setIsMobile] = useState(false);
    const startDate = timeContext?.data.cursor
    const interval = timeContext?.data.interval
    const isLive = timeContext?.data.isLive

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (!(startDate && interval) && !isLive) return
        setLoading(true)
        fetchStats(server_id, startDate, interval, isLive)
            .then(setData)
            .finally(() => setLoading(false))
    }, [server_id, startDate, interval, isLive]);

    const totalPages = Math.ceil(data.countries.length / pageSize);
    const currentCountries = data.countries.slice(
        (page - 1) * pageSize,
        page * pageSize
    );

    const handlePageChange = (newPage) => {
        setPage(newPage);
    };

    return (
        <TooltipProvider>
            <Collapsible
                open={isExpanded}
                onOpenChange={setIsExpanded}
                className={cn(
                    "backdrop-blur-md rounded overflow-hidden shadow-md transition-all duration-300 border",
                    "bg-background/80 dark:bg-background/70",
                    "border-border/40",
                    "hover:shadow-lg",
                    isExpanded ? (isMobile ? "w-[120px]" : "w-[250px]") : "w-[80px]",
                    "max-w-[250px]"
                )}
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <CollapsibleTrigger asChild>
                            <div
                                className={cn(
                                    "flex items-center justify-between p-3 cursor-pointer gap-2",
                                    isExpanded && "border-b border-border/40"
                                )}
                            >
                                <Users className="h-5 w-5" />

                                {isExpanded && !isMobile && (
                                    <span className="text-sm font-semibold flex-1">
                                        {labels?.playerDistribution ?? "Player Distribution"}
                                    </span>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </div>
                        </CollapsibleTrigger>
                    </TooltipTrigger>
                    {!isExpanded && !isMobile && (
                        <TooltipContent>{labels?.playerDistribution ?? "Player Distribution"}</TooltipContent>
                    )}
                </Tooltip>

                <CollapsibleContent>
                    <div className="p-3">
                        <div className={cn(
                            "flex items-center mb-3 pb-2 border-b border-border/20",
                            isMobile ? "justify-center" : "justify-between"
                        )}>
                            {!isMobile && (
                                <span className="text-xs text-muted-foreground">
                                    {labels?.playersOnMap ?? "Players On Map:"}
                                </span>
                            )}
                            <span className="text-xs font-semibold">
                                <span title={labels?.publicLocation ?? "Total players that set public location"}>{data.in_view_count} </span>
                                / <span title={labels?.totalTimeframe ?? "Total players in this timeframe"}>{data.total_count}</span>
                            </span>
                        </div>

                        {/* Country list */}
                        {loading ? (
                            <div className="flex justify-center p-4">
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                        ) : (
                            <>
                                <ul className="space-y-2">
                                    {currentCountries.map((country) => (
                                        <li
                                            key={country.code}
                                            className="flex justify-between items-center py-1"
                                        >
                                            <div className="flex items-center">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="flex items-center mr-2 w-6 h-[18px] overflow-hidden rounded shadow-sm">
                                                            <img
                                                                src={getFlagUrl(country.code)}
                                                                alt={country.name}
                                                                className="w-full h-auto block"
                                                                loading="lazy"
                                                            />
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
                                            <span className="text-xs font-semibold">
                                                {country.count}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex justify-center items-center gap-1 mt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handlePageChange(Math.max(1, page - 1))}
                                            disabled={page === 1}
                                        >
                                            <ChevronLeft className="h-3 w-3" />
                                        </Button>

                                        {!isMobile && Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                                            <Button
                                                key={pageNum}
                                                variant={pageNum === page ? "default" : "outline"}
                                                size="sm"
                                                className="h-6 min-w-6 px-2 text-xs"
                                                onClick={() => handlePageChange(pageNum)}
                                            >
                                                {pageNum}
                                            </Button>
                                        ))}

                                        {isMobile && (
                                            <span className="text-xs px-2">{page}</span>
                                        )}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                                            disabled={page === totalPages}
                                        >
                                            <ChevronRight className="h-3 w-3" />
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </TooltipProvider>
    );
};

const StatsControl = createControlComponent(
    (props) => {
        return new CountryStatsControl(props);
    }
);

export default function StatsComponent() {
    const t = useTranslations('radar');
    const timeContext = useContext(TemporalContext)
    const { server } = useServerData()
    const server_id = server.id
    const deferredTimeContext = useDeferredValue(timeContext)
    const ref = useRef()
    const debounced = useRef()
    const labels = {
        statsError: t('statsError'),
        playerDistribution: t('playerDistribution'),
        playersOnMap: t('playersOnMap'),
        publicLocation: t('publicLocation'),
        totalTimeframe: t('totalTimeframe'),
    }
    useEffect(() => {
        if (debounced.current) {
            clearTimeout(debounced.current);
        }
        debounced.current = setTimeout(() => {
            ref.current.updateData({ timeContext: deferredTimeContext, server_id, labels })
        }, 600);
    }, [deferredTimeContext, server_id, t])
    return (
        <StatsControl ref={ref} timeContext={deferredTimeContext} server_id={server_id} labels={labels} position="topright"/>
    );
}