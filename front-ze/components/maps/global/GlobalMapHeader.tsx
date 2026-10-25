'use client'
import {useEffect, useState} from "react";
import {useTranslations} from 'next-intl';
import Image from "next/image";
import {AlertTriangle} from "lucide-react";
import {fetchApiUrl} from "utils/generalUtils.ts";
import {Badge} from "components/ui/badge";
import {TooltipProvider} from "components/ui/tooltip";
import LoginDialog from "components/ui/LoginDialog.tsx";
import {GAME_META} from "components/ui/ServerIndicator";
import {withErrorCatch} from "components/common/withErrorCatch";
import {Map3DButton, MapHeaderStats, OverlayBadge} from "components/maps/MapHeader";
import {FavoriteButton, globalMapImage} from "./GlobalMapsTable";
import GlobalMapStatusChip from "./GlobalMapStatusChip";
import CommunityAvatarStack from "./CommunityAvatarStack";
import {useMapContext} from "../../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {GlobalMapInfo} from "types/maps.ts";

function GlobalMapHeaderDisplay({ loggedIn }: { loggedIn: boolean }) {
    const t = useTranslations('maps.header');
    const { name, analyze, info, notReady } = useMapContext<GlobalMapInfo>();
    const map = info?.map ?? null
    const url = map ? globalMapImage(map, 'extra_large') : null
    const [favorites, setFavorites] = useState<Set<string>>(new Set())
    const [loginDialogOpen, setLoginDialogOpen] = useState(false)

    useEffect(() => {
        setFavorites(map?.is_favorite ? new Set([map.map]) : new Set())
    }, [map?.map, map?.is_favorite])

    const toggleFavorite = async (mapName: string) => {
        if (!loggedIn) {
            setLoginDialogOpen(true)
            return
        }
        const isFavorite = favorites.has(mapName)
        const action = isFavorite ? 'unset-favorite' : 'set-favorite'
        try {
            await fetchApiUrl(`/maps/${encodeURIComponent(mapName)}/${action}`, {method: 'POST'})
            setFavorites(isFavorite ? new Set() : new Set([mapName]))
        } catch (err) {
            console.error('Failed to toggle favorite:', err)
        }
    }

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

                <div className="absolute top-0 left-0 p-2 sm:p-4 flex flex-col items-start">
                    {map && <GlobalMapStatusChip map={map} />}
                    {map?.is_casual && !map.is_tryhard && <OverlayBadge spaced color="text-green-500">{t('casual')}</OverlayBadge>}
                    {!map?.is_casual && map?.is_tryhard && <OverlayBadge spaced color="text-red-500">{t('tryhard')}</OverlayBadge>}
                    {map?.is_casual && map.is_tryhard && <OverlayBadge spaced color="text-blue-500">{t('mixed')}</OverlayBadge>}
                    {map?.no_noms && <OverlayBadge spaced color="text-orange-500">{t('noNomsOnly')}</OverlayBadge>}
                    {map?.has_lasers && <OverlayBadge spaced color="text-blue-400">{t('hasLasers')}</OverlayBadge>}
                </div>

                <div className="absolute top-0 right-0 p-2 sm:p-4 flex flex-col gap-2 items-end">
                    {notReady && (
                        <OverlayBadge color="text-destructive" icon={AlertTriangle} tooltip={t('stillCalculating')}>
                            {t('dataNotReady')}
                        </OverlayBadge>
                    )}
                    {map && (
                        <FavoriteButton
                            mapName={map.map}
                            favorites={favorites}
                            toggleFavorite={toggleFavorite}
                            className="bg-black/50 backdrop-blur-sm text-white hover:bg-black/60 hover:text-white"
                        />
                    )}
                    <Map3DButton name={name} href={`/maps/${name}/3d`} />
                </div>

                <MapHeaderStats name={name} analyze={analyze}>
                    {map && (
                        <div className="flex flex-wrap items-center gap-2 mb-2 sm:mb-3">
                            {map.games.map(game => {
                                const meta = GAME_META[game]
                                return meta && (
                                    <Badge key={game} variant="outline" className={`bg-black/40 text-xs ${meta.className}`}>
                                        {meta.label}
                                    </Badge>
                                )
                            })}
                            <CommunityAvatarStack servers={map.servers} countClassName="text-white/80" />
                        </div>
                    )}
                </MapHeaderStats>
            </div>
            <LoginDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} />
        </TooltipProvider>
    );
}

export default withErrorCatch(GlobalMapHeaderDisplay, t => t('maps.header.loadError'))
