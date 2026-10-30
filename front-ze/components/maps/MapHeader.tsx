'use client'
import {useTranslations, useLocale} from 'next-intl';
import {ReactNode} from "react";
import {getMapImage, map3dViewerUrl} from "utils/generalUtils.ts";
import {Clock, Users, RotateCcw, User, AlarmClock, AlertTriangle, Ban, BoxesIcon, CalendarClock, Globe, LucideIcon} from "lucide-react";
import {Skeleton} from "components/ui/skeleton";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {Button} from "components/ui/button";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import {useResource} from "lib/hooks/useResource";
import Image from "next/image";
import {MapAnalyze} from "types/maps.ts";
import {PeriodChip, usePeriod} from "components/period/Period";
import {withErrorCatch} from "components/common/withErrorCatch";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {cn} from "components/lib/utils";
import {isOnCooldown, mapBlockers} from "utils/mapCooldown";
import {useMapCooldownText} from "lib/hooks/useMapCooldownText";
import ViewCount from "components/ui/ViewCount";

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
        <div className={cn("bg-black/50 px-2 py-1 rounded backdrop-blur-sm", spaced && "mt-2")}>
            {tooltip ? (
                <Tooltip>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent suppressHydrationWarning={suppressHydrationWarning}>{tooltip}</TooltipContent>
                </Tooltip>
            ) : content}
        </div>
    );
}

/** Links out to maps.cybo.dev, which hosts the 3D views of maps. */
export function Map3DButton({ name }: { name: string }) {
    const t = useTranslations('maps.header');
    return (
        <Button size="sm" asChild className="bg-primary/90 hover:bg-primary text-primary-foreground backdrop-blur-sm">
            <a href={map3dViewerUrl(name)} target="_blank" rel="noopener noreferrer">
                <BoxesIcon className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">{t('viewIn3d')}</span>
            </a>
        </Button>
    )
}

const STAT_TEXT = "text-white ml-1 text-xs sm:text-sm md:text-base font-medium"

/** One header figure: icon, value and (from sm up) its label; two skeleton bars of the given widths while loading. */
function HeaderStat({ icon: Icon, loading, skeleton, value, label, labelFirst = false, className = "mr-2 sm:mr-4" }: {
    icon: LucideIcon, loading: boolean, skeleton: [string, string], value: ReactNode, label: string,
    labelFirst?: boolean, className?: string,
}) {
    const labelText = <span className={`${STAT_TEXT} hidden sm:inline`}>{label}</span>
    return (
        <div className={cn("flex items-center mb-2 sm:mb-0", className)}>
            <Icon className="text-white h-3.5 w-3.5 sm:h-5 sm:w-5" />
            {loading ? (
                <>
                    <Skeleton className={`${skeleton[0]} h-4 ml-1 bg-white/20`} />
                    <Skeleton className={`${skeleton[1]} h-4 ml-1 bg-white/20 hidden sm:inline-block`} />
                </>
            ) : (
                <>
                    {labelFirst && labelText}
                    <span className={STAT_TEXT} suppressHydrationWarning>{value}</span>
                    {!labelFirst && labelText}
                </>
            )}
        </div>
    );
}

export function MapHeaderStats({ name, analyze, viewsPromise, children }: {
    name: string, analyze: MapAnalyze | null, viewsPromise?: Promise<number | null>, children?: ReactNode,
}) {
    const t = useTranslations('maps.header');
    const locale = useLocale();
    const toDayjs = useLocalDayjs();
    const { period } = usePeriod();
    const loading = !analyze
    return (
        <div className="absolute bottom-0 left-0 p-2 sm:p-4 text-start w-full bg-gradient-to-t from-black/80 to-transparent">
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-2 sm:mb-4">
                {name}
            </h1>
            {children}
            <div className="flex flex-wrap gap-1 sm:gap-2 items-center">
                <PeriodChip className="mr-2 sm:mr-4 mb-2 sm:mb-0 border-white/40 bg-white/15 text-white" />
                <HeaderStat
                    icon={Clock}
                    loading={loading}
                    skeleton={['w-12', 'w-24']}
                    value={`${analyze ? (analyze.total_playtime / 60 / 60).toLocaleString(locale, {minimumFractionDigits: 3}) : 0}h`}
                    label={t('totalPlaytime')}
                />
                <HeaderStat
                    icon={Users}
                    loading={loading}
                    skeleton={['w-8', 'w-16']}
                    value={analyze?.total_sessions.toLocaleString(locale)}
                    label={t('sessions')}
                />
                {!period && <HeaderStat
                    icon={RotateCcw}
                    loading={loading}
                    skeleton={['w-16', 'w-20']}
                    value={toDayjs(analyze?.last_played).fromNow()}
                    label={t('lastPlayed')}
                    labelFirst
                />}
                <HeaderStat
                    icon={User}
                    loading={loading}
                    skeleton={['w-10', 'w-32']}
                    value={analyze?.unique_players.toLocaleString(locale)}
                    label={t('havePlayed')}
                    className=""
                />

                {viewsPromise && <ViewCount
                    viewsPromise={viewsPromise}
                    className="ml-2 sm:ml-4 mb-2 sm:mb-0 text-white text-xs sm:text-sm md:text-base font-medium"
                    iconClassName="text-white h-3.5 w-3.5 sm:h-5 sm:w-5"
                />}
            </div>
        </div>
    );
}

function MapHeaderDisplay({ viewsPromise }: { viewsPromise?: Promise<number | null> }) {
    const t = useTranslations('maps.header');
    const tTable = useTranslations('maps.table');
    const { name, analyze, info, notReady } = useMapContext();
    const { server } = useServerData()
    const toDayjs = useLocalDayjs();
    const cooldownText = useMapCooldownText();
    const blockers = mapBlockers(info?.map_left, info?.current_cooldown, info?.nom_opens_at);
    const nomWindow = info ? cooldownText.window(info) : null;
    const { data: url } = useResource(() => name
        ? getMapImage(server.id, name).then(e => e ? e.extra_large : null)
        : null, [server.id, name])

    return (
        <div className="relative overflow-hidden rounded-2xl h-full">
            <div className="w-full h-full aspect-[1051/550] xl:max-h-110 max-sm:h-50 overflow-hidden relative">
                {url ? (
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

            <div className="absolute top-0 left-0 p-2 sm:p-4">
                {blockers.mapsLeft != null && (
                    <OverlayBadge color="text-amber-500" icon={AlarmClock}>{tTable('mapsLeft', {count: blockers.mapsLeft})}</OverlayBadge>
                )}
                {blockers.cooldownUntil && (
                    <OverlayBadge spaced={blockers.mapsLeft != null} color="text-amber-500" icon={AlarmClock}
                                  tooltip={toDayjs(blockers.cooldownUntil).format('lll')} suppressHydrationWarning>
                        {t('cooldownEndsIn', {time: toDayjs(blockers.cooldownUntil).fromNow(true)})}
                    </OverlayBadge>
                )}
                {nomWindow && (
                    <OverlayBadge spaced={isOnCooldown(blockers)} color={blockers.opensAt ? "text-amber-500" : "text-sky-400"} icon={CalendarClock}
                                  tooltip={blockers.opensAt ? nomWindow : undefined} suppressHydrationWarning>
                        {blockers.opensAt ? tTable('opensIn', {time: toDayjs(blockers.opensAt).fromNow(true)}) : nomWindow}
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
                    <OverlayBadge spaced color="text-white" icon={Users}>{t('maxPlayers', {count: info.max_players})}</OverlayBadge>
                )}
            </div>

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
                <Map3DButton name={name} />
            </div>

            <MapHeaderStats name={name} analyze={analyze} viewsPromise={viewsPromise} />
        </div>
    );
}

export default withErrorCatch(MapHeaderDisplay, t => t('maps.header.loadError'))
