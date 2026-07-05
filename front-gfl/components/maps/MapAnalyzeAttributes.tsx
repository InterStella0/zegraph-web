'use client'
import {ReactElement, useEffect, useState} from "react";
import { useTheme } from "next-themes";
import { Info, Users, LogOut, Clock, Star, AlertTriangle, Save, Hourglass } from "lucide-react";
import { Card } from "../ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Skeleton } from "../ui/skeleton";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useTranslations} from 'next-intl';

function StatCard(
    { title, value, description, icon, colorKey, loading = false, notReady = false, href = null }
    : {title: string, value: any, description: string, icon?: ReactElement, colorKey?: string, loading?: boolean,
        href?: string | null, notReady?: boolean}
) {
    const t = useTranslations('maps.analyze');
    const { resolvedTheme } = useTheme();
    const [ isClient, setIsClient ] = useState(false)
    const isDark = resolvedTheme === 'dark';

    const colorMap = {
        purple: isClient && isDark ? 'text-purple-400' : 'text-purple-700',
        red: isClient && isDark ? 'text-red-400' : 'text-red-700',
        blue: isClient && isDark ? 'text-blue-400' : 'text-blue-700',
        green: isClient && isDark ? 'text-green-400' : 'text-green-700',
    };

    const colorClass = colorMap[colorKey] || colorMap.purple;

    useEffect(() => {
        setIsClient(true)
    }, [])

    return (
        <Card>
            {/* Mobile Layout */}
            <div className="sm:hidden w-full flex flex-row justify-between items-center">
                <div className="flex items-center gap-1.5">
                    <div className={colorClass}>
                        {icon}
                    </div>
                    <div>
                        <div className="text-xs font-medium flex items-center">
                            {title}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="ml-1 inline-flex">
                                            {notReady ? (
                                                <AlertTriangle className="h-3 w-3 text-destructive" />
                                            ) : (
                                                <Info className="h-3 w-3 opacity-70" />
                                            )}
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{notReady ? t('stillCalculating') : description}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        {loading ? (
                            <Skeleton className="w-[60px] h-[25px]" />
                        ) : (
                            <div className={`text-xl font-bold leading-tight ${colorClass}`}>
                                {value}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden sm:flex  w-full h-full flex-col">
                <div className="flex justify-between mb-2">
                    <div className="flex gap-2">
                        <div className={colorClass}>
                            {icon}
                        </div>
                        <p className="text-sm font-medium">
                            {title}
                        </p>
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="inline-flex">
                                    {notReady ? (
                                        <AlertTriangle className="h-4 w-4 text-destructive" />
                                    ) : (
                                        <Info className="h-4 w-4 opacity-70" />
                                    )}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{notReady ? t('stillCalculating') : description}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                {loading ? (
                    <Skeleton className="w-4/5 h-6" />
                ) : href ? (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-lg font-bold mt-1 ${colorClass}`}
                    >
                        {value}
                    </a>
                ) : (
                    <p className={`text-lg font-bold mt-1 ${colorClass}`}>
                        {value}
                    </p>
                )}
            </div>
        </Card>
    );
}
function formatBytes(bytes: number, decimals: number = 2): string{
    if (bytes === 0) return '0 B';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;

    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));

    return `${size} ${sizes[i]}`;
}

function MapStats() {
    const t = useTranslations('maps.analyze');
    const { analyze, info, notReady } = useMapContext();
    const isStatLoading = !analyze
    const isMetaLoading = !info
    const stats = [
        {
            id: "avg_players",
            title: t('avgPlayers'),
            value: analyze?.avg_players_per_session,
            loading: isStatLoading,
            notReady: notReady,
            description: t('avgPlayersDesc'),
            icon: <Users className="sm:h-5 sm:w-5 h-4 w-4" />,
            colorKey: "purple",
        },
        {
            id: "dropoff_rate",
            title: t('dropoffRate'),
            loading: isStatLoading,
            notReady: notReady,
            value: analyze ? `${(analyze.dropoff_rate * 100).toFixed(2)}%` : null,
            description: t('dropoffRateDesc'),
            icon: <LogOut className="sm:h-5 sm:w-5 h-4 w-4" />,
            colorKey: "red",
        },
        {
            id: "avg_playtime",
            title: t('avgPlaytime'),
            loading: isStatLoading,
            notReady: notReady,
            value: analyze ? `${(analyze.avg_playtime_before_quitting / 60).toFixed(0)}m` : null,
            description: t('avgPlaytimeDesc'),
            icon: <Clock className="sm:h-5 sm:w-5 h-4 w-4" />,
            colorKey: "blue",
        },
        {
            id: "cumulative hours",
            title: t('cumHours'),
            loading: isStatLoading,
            notReady: notReady,
            value: analyze? `${(analyze.cum_player_hours / 60 / 60).toFixed(1)}m`: 'N/A',
            description: t('cumHoursDesc'),
            icon: <Hourglass className="sm:h-5 sm:w-5 h-4 w-4" />,
            colorKey: "green",
        },
        {
            id: "creator",
            title: t('creators'),
            loading: isMetaLoading,
            value: info?.creators || t('unknown'),
            description: t('creatorsDesc'),
            icon: <Star className="sm:h-5 sm:w-5 h-4 w-4" />,
            colorKey: "purple",
            href: info?.workshop_id? `https://steamcommunity.com/sharedfiles/filedetails/?id=${info?.workshop_id}`: null
        },
        {
            id: "file_size",
            title: t('fileSize'),
            loading: isMetaLoading,
            value: formatBytes(info?.file_bytes || 0),
            description: t('fileSizeDesc'),
            icon: <Save className="sm:h-5 sm:w-5 h-4 w-4" />,
            colorKey: "blue",
        },
    ];

    return (
        <div className="w-full mx-0">
            <div className="grid md:grid-cols-3 xl:grid-cols-2 lg:grid-cols-1 gap-2 sm:grid-cols-2">
                {stats.map((stat) => (
                    <StatCard
                        key={stat.id}
                        title={stat.title}
                        value={stat.value}
                        description={stat.description}
                        icon={stat.icon}
                        colorKey={stat.colorKey}
                        loading={stat.loading}
                        notReady={stat.notReady}
                        href={stat.href}
                    />
                ))}
            </div>
        </div>
    );
}

export default function MapAnalyzeAttributes() {
    const t = useTranslations('maps.analyze');
    return (
        <ErrorCatch message={t('loadError')}>
            <MapStats />
        </ErrorCatch>
    );
}