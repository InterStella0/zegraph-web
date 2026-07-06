'use client'
import {useTranslations, useLocale} from 'next-intl';
import { useEffect, useState} from "react";
import {fetchApiUrl, getMapImage} from "utils/generalUtils.ts";
import {Clock, Users, RotateCcw, User, AlarmClock, AlertTriangle, Ban, BoxesIcon} from "lucide-react";
import dayjs from "dayjs";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {Skeleton} from "components/ui/skeleton";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "components/ui/tooltip";
import {Button} from "components/ui/button";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import relativeTime from "dayjs/plugin/relativeTime";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {MapWithModels} from "types/maps.ts";
dayjs.extend(relativeTime);

async function checkModelExists(mapName: string): Promise<boolean> {
    try {
        const data: MapWithModels = await fetchApiUrl(`/maps/${mapName}/3d`)
        return !(data.high_res_model === null && data.low_res_model === null)
    } catch (error) {
        return false
    }
}

function MapHeaderDisplay() {
    const t = useTranslations('maps.header');
    const locale = useLocale();
    const [url, setUrl] = useState<string | null>(null);
    const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
    const { name, analyze, info, notReady } = useMapContext();
    const { server} = useServerData()
    const router = useRouter()
    const server_id = server.id
    const isLoading = !analyze
    let cooldownLeft = 0
    let cooldown = null
    if (info){
        cooldown = dayjs(info?.current_cooldown)
        cooldownLeft = cooldown.diff(dayjs(), 'second')
    }
    const mapLeft = info?.map_left ?? 0

    useEffect(() => {
        setUrl(null)
        getMapImage(server_id, name).then(e => setUrl(e? e.extra_large: null))
    }, [server_id, name]);

    useEffect(() => {
        checkModelExists(name).then(setModelAvailable)
    }, [name]);

    return (
        <TooltipProvider>
            <div className="relative overflow-hidden rounded-2xl h-full">
                <div className="w-full h-full xl:max-h-110 max-sm:h-50 overflow-hidden relative">
                    {url !== null ? (
                        <Image
                            src={url}
                            width={1051}
                            height={550}
                            className="object-cover w-full h-full block"
                            alt={`Map ${name}`}
                            title={name}
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-full h-full bg-muted" />
                    )}
                </div>

                {/* Top-left cooldown badge */}
                <div className="absolute top-0 left-0 p-2 sm:p-4">
                    {mapLeft > 0 ? (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                            <div className="flex flex-row items-center gap-1 text-amber-500">
                                <AlarmClock className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    {mapLeft} maps left
                                </span>
                            </div>
                        </div>
                    ) : cooldownLeft > 0 && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex flex-row items-center gap-1 text-amber-500">
                                        <AlarmClock className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                                        <span className="text-xs sm:text-sm md:text-base font-medium" suppressHydrationWarning>
                                            Cooldown ends in {cooldown?.fromNow(true)}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent suppressHydrationWarning>
                                    {cooldown?.format('lll')}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                    {info?.removed && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                            <div className="flex flex-row items-center gap-1 text-destructive">
                                <Ban className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    {t('removed')}
                                </span>
                            </div>
                        </div>
                    )}
                    {info?.is_casual && !info?.is_tryhard && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm mt-2">
                            <div className="flex flex-row items-center gap-1 text-green-500">
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    {t('casual')}
                                </span>
                            </div>
                        </div>
                    )}
                    {!info?.is_casual && info?.is_tryhard && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm mt-2">
                            <div className="flex flex-row items-center gap-1 text-red-500">
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    {t('tryhard')}
                                </span>
                            </div>
                        </div>
                    )}
                    {info?.is_casual && info?.is_tryhard && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm mt-2">
                            <div className="flex flex-row items-center gap-1 text-blue-500">
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    {t('mixed')}
                                </span>
                            </div>
                        </div>
                    )}
                    {info?.no_noms && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm mt-2">
                            <div className="flex flex-row items-center gap-1 text-orange-500">
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    {t('noNomsOnly')}
                                </span>
                            </div>
                        </div>
                    )}
                    {info?.has_lasers && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm mt-2">
                            <div className="flex flex-row items-center gap-1 text-blue-400">
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    {t('hasLasers')}
                                </span>
                            </div>
                        </div>
                    )}
                    {info?.min_players != null && info.min_players > 0 && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm mt-2">
                            <div className="flex flex-row items-center gap-1 text-white">
                                <Users className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    {t('minPlayers', {count: info.min_players})}
                                </span>
                            </div>
                        </div>
                    )}
                    {info?.max_players != null && (info.max_players != server.max_players && info.max_players != 0) && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm mt-2">
                            <div className="flex flex-row items-center gap-1 text-white">
                                <Users className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                                <span className="text-xs sm:text-sm md:text-base font-medium">
                                    Max {info.max_players} players
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Top-right not ready warning and 3D button */}
                <div className="absolute top-0 right-0 p-2 sm:p-4 flex flex-col gap-2 items-end">
                    {notReady && (
                        <div className="bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex flex-row items-center gap-1 text-destructive">
                                        <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                                        <span className="text-xs sm:text-sm md:text-base font-medium">
                                            {t('dataNotReady')}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('stillCalculating')}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}

                    {/* 3D Viewer Button */}
                    {modelAvailable === null ? (
                        <Skeleton className="h-9 w-9 sm:w-32 rounded bg-white/20" />
                    ) : modelAvailable ? (
                        <Button
                            size="sm"
                            onClick={() => router.push(`/maps/${name}/3d?server_slug=${server.gotoLink}`)}
                            className="bg-primary/90 hover:bg-primary text-primary-foreground backdrop-blur-sm"
                        >
                            <BoxesIcon className="h-4 w-4" />
                            <span className="ml-2 hidden sm:inline">{t('viewIn3d')}</span>
                        </Button>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div>
                                    <Button
                                        size="sm"
                                        disabled
                                        className="backdrop-blur-sm"
                                    >
                                        <BoxesIcon className="h-4 w-4" />
                                        <span className="ml-2 hidden sm:inline">{t('viewIn3d')}</span>
                                    </Button>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('no3dModel')}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>

                {/* Bottom gradient overlay with stats */}
                <div className="absolute bottom-0 left-0 p-2 sm:p-4 text-start w-full bg-gradient-to-t from-black/80 to-transparent">
                    <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-2 sm:mb-4">
                        {name}
                    </h1>
                    <div className="flex flex-wrap gap-1 sm:gap-2 items-center">
                        {/* Total playtime */}
                        <div className="flex items-center mr-2 sm:mr-4 mb-2 sm:mb-0">
                            <Clock className="text-white h-3.5 w-3.5 sm:h-5 sm:w-5" />
                            {isLoading && (
                                <>
                                    <Skeleton className="w-12 h-4 ml-1 bg-white/20" />
                                    <Skeleton className="w-24 h-4 ml-1 bg-white/20 hidden sm:inline-block" />
                                </>
                            )}
                            {!isLoading && (
                                <>
                                    <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium">
                                        {analyze? (analyze.total_playtime / 60 / 60).toLocaleString(locale, {minimumFractionDigits: 3}): 0}h
                                    </span>
                                    <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium hidden sm:inline">
                                        {t('totalPlaytime')}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Sessions */}
                        <div className="flex items-center mr-2 sm:mr-4 mb-2 sm:mb-0">
                            <Users className="text-white h-3.5 w-3.5 sm:h-5 sm:w-5" />
                            {isLoading && (
                                <>
                                    <Skeleton className="w-8 h-4 ml-1 bg-white/20" />
                                    <Skeleton className="w-16 h-4 ml-1 bg-white/20 hidden sm:inline-block" />
                                </>
                            )}
                            {!isLoading && (
                                <>
                                    <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium">
                                        {analyze?.total_sessions.toLocaleString(locale)}
                                    </span>
                                    <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium hidden sm:inline">
                                        {t('sessions')}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Last played */}
                        <div className="flex items-center mr-2 sm:mr-4 mb-2 sm:mb-0">
                            <RotateCcw className="text-white h-3.5 w-3.5 sm:h-5 sm:w-5" />
                            {isLoading && (
                                <>
                                    <Skeleton className="w-16 h-4 ml-1 bg-white/20" />
                                    <Skeleton className="w-20 h-4 ml-1 bg-white/20 hidden sm:inline-block" />
                                </>
                            )}
                            {!isLoading && (
                                <>
                                    <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium hidden sm:inline">
                                        {t('lastPlayed')}
                                    </span>
                                    <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium">
                                        {dayjs(analyze?.last_played).fromNow()}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Unique players */}
                        <div className="flex items-center mb-2 sm:mb-0">
                            <User className="text-white h-3.5 w-3.5 sm:h-5 sm:w-5" />
                            {isLoading && (
                                <>
                                    <Skeleton className="w-10 h-4 ml-1 bg-white/20" />
                                    <Skeleton className="w-32 h-4 ml-1 bg-white/20 hidden sm:inline-block" />
                                </>
                            )}
                            {!isLoading && (
                                <>
                                    <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium">
                                        {analyze?.unique_players.toLocaleString(locale)}
                                    </span>
                                    <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium hidden sm:inline">
                                        {t('havePlayed')}
                                    </span>
                                </>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

export default function MapHeader(){
    const t = useTranslations('maps.header');
    return <ErrorCatch message={t('loadError')}>
        <MapHeaderDisplay />
    </ErrorCatch>
}
