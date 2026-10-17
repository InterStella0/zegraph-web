'use client'
import {useTranslations, useLocale} from 'next-intl';
import {ReactNode, useEffect, useState} from "react";
import {fetchApiUrl, getMapImage} from "utils/generalUtils.ts";
import {Clock, Users, RotateCcw, User, AlarmClock, AlertTriangle, Ban, BoxesIcon, Globe, LucideIcon} from "lucide-react";
import dayjs from "dayjs";
import {Skeleton} from "components/ui/skeleton";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "components/ui/tooltip";
import {Button} from "components/ui/button";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import relativeTime from "dayjs/plugin/relativeTime";
import {useLocalDayjs} from "lib/hooks/useHydrated";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {MapAnalyze, MapWithModels} from "types/maps.ts";
import {PeriodChip, usePeriod} from "components/period/Period";
import {withErrorCatch} from "components/common/withErrorCatch";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
dayjs.extend(relativeTime);

async function checkModelExists(mapName: string): Promise<boolean> {
    try {
        const data: MapWithModels = await fetchApiUrl(`/maps/${mapName}/3d`)
        return !(data.high_res_model === null && data.low_res_model === null)
    } catch (error) {
        return false
    }
}

export function OverlayBadge({ color, icon: Icon, spaced, tooltip, suppressHydrationWarning, children }: {
    color: string, icon?: LucideIcon, spaced?: boolean, tooltip?: ReactNode, suppressHydrationWarning?: boolean, children: ReactNode,
}) {
    const content = (
        <div className={`flex flex-row items-center gap-1 ${color}`}>
            {Icon && <Icon className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />}
            <span className="text-xs sm:text-sm md:text-base font-medium" suppressHydrationWarning={suppressHydrationWarning}>
                {children}
            </span>
        </div>
    );
    return (
        <div className={spaced ? "bg-black/50 px-2 py-1 rounded backdrop-blur-sm mt-2" : "bg-black/50 px-2 py-1 rounded backdrop-blur-sm"}>
            {tooltip ? (
                <Tooltip>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent suppressHydrationWarning={suppressHydrationWarning}>{tooltip}</TooltipContent>
                </Tooltip>
            ) : content}
        </div>
    );
}

/** Opens the map in the 3D viewer at `href`, or explains there is no model to show. */
export function Map3DButton({ name, href }: { name: string, href: string }) {
    const t = useTranslations('maps.header');
    const router = useRouter()
    const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        if (!name) return
        checkModelExists(name).then(setModelAvailable)
    }, [name]);

    return modelAvailable === null ? (
        <Skeleton className="h-9 w-9 sm:w-32 rounded bg-white/20" />
    ) : modelAvailable ? (
        <Button
            size="sm"
            onClick={() => router.push(href)}
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
    )
}

/**
 * The bottom overlay of a map header: the map name and its playtime, sessions and players, with
 * `children` between the two.
 */
export function MapHeaderStats({ name, analyze, children }: { name: string, analyze: MapAnalyze | null, children?: ReactNode }) {
    const t = useTranslations('maps.header');
    const locale = useLocale();
    const toDayjs = useLocalDayjs();
    const { period } = usePeriod();
    const isLoading = !analyze
    return (
        <div className="absolute bottom-0 left-0 p-2 sm:p-4 text-start w-full bg-gradient-to-t from-black/80 to-transparent">
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-2 sm:mb-4">
                {name}
            </h1>
            {children}
            <div className="flex flex-wrap gap-1 sm:gap-2 items-center">
                <PeriodChip className="mr-2 sm:mr-4 mb-2 sm:mb-0 border-white/40 bg-white/15 text-white" />
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
                {!period && <div className="flex items-center mr-2 sm:mr-4 mb-2 sm:mb-0">
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
                            <span className="text-white ml-1 text-xs sm:text-sm md:text-base font-medium" suppressHydrationWarning>
                                {toDayjs(analyze?.last_played).fromNow()}
                            </span>
                        </>
                    )}
                </div>}

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
    );
}

function MapHeaderDisplay() {
    const t = useTranslations('maps.header');
    const [url, setUrl] = useState<string | null>(null);
    const { name, analyze, info, notReady } = useMapContext();
    const { server} = useServerData()
    const server_id = server.id
    let cooldownLeft = 0
    let cooldown = null
    if (info){
        cooldown = dayjs(info?.current_cooldown)
        cooldownLeft = cooldown.diff(dayjs(), 'second')
    }
    const mapLeft = info?.map_left ?? 0

    useEffect(() => {
        if (!name) return
        setUrl(null)
        getMapImage(server_id, name).then(e => setUrl(e? e.extra_large: null))
    }, [server_id, name]);

    return (
        <TooltipProvider>
            <div className="relative overflow-hidden rounded-2xl h-full">
                <div className="w-full h-full aspect-[1051/550] xl:max-h-110 max-sm:h-50 overflow-hidden relative">
                    {url !== null ? (
                        <Image
                            unoptimized
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
                        <OverlayBadge color="text-amber-500" icon={AlarmClock}>{mapLeft} maps left</OverlayBadge>
                    ) : cooldownLeft > 0 && (
                        <OverlayBadge color="text-amber-500" icon={AlarmClock} tooltip={cooldown?.format('lll')} suppressHydrationWarning>
                            Cooldown ends in {cooldown?.fromNow(true)}
                        </OverlayBadge>
                    )}
                    {info?.removed && <OverlayBadge color="text-destructive" icon={Ban}>{t('removed')}</OverlayBadge>}
                    {info?.is_casual && !info?.is_tryhard && <OverlayBadge spaced color="text-green-500">{t('casual')}</OverlayBadge>}
                    {!info?.is_casual && info?.is_tryhard && <OverlayBadge spaced color="text-red-500">{t('tryhard')}</OverlayBadge>}
                    {info?.is_casual && info?.is_tryhard && <OverlayBadge spaced color="text-blue-500">{t('mixed')}</OverlayBadge>}
                    {info?.no_noms && <OverlayBadge spaced color="text-orange-500">{t('noNomsOnly')}</OverlayBadge>}
                    {info?.has_lasers && <OverlayBadge spaced color="text-blue-400">{t('hasLasers')}</OverlayBadge>}
                    {info?.min_players != null && info.min_players > 0 && (
                        <OverlayBadge spaced color="text-white" icon={Users}>{t('minPlayers', {count: info.min_players})}</OverlayBadge>
                    )}
                    {info?.max_players != null && (info.max_players != server.max_players && info.max_players != 0) && (
                        <OverlayBadge spaced color="text-white" icon={Users}>Max {info.max_players} players</OverlayBadge>
                    )}
                </div>

                {/* Top-right not ready warning and 3D button */}
                <div className="absolute top-0 right-0 p-2 sm:p-4 flex flex-col gap-2 items-end">
                    {notReady && (
                        <OverlayBadge color="text-destructive" icon={AlertTriangle} tooltip={t('stillCalculating')}>
                            {t('dataNotReady')}
                        </OverlayBadge>
                    )}

                    <HoverPrefetchLink href={`/maps/${name}`}>
                        <OverlayBadge color="text-white" icon={Globe} tooltip={t('allServersTooltip')}>
                            {t('allServers')}
                        </OverlayBadge>
                    </HoverPrefetchLink>
                    <Map3DButton name={name} href={`/maps/${name}/3d?server_slug=${server.gotoLink}`} />
                </div>

                <MapHeaderStats name={name} analyze={analyze} />
            </div>
        </TooltipProvider>
    );
}

export default withErrorCatch(MapHeaderDisplay, t => t('maps.header.loadError'))
