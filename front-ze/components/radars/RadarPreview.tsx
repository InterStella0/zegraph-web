'use client'

import ErrorCatch from "../ui/ErrorMessage.tsx";
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import {Dialog, DialogContent, DialogTrigger, DialogClose, DialogTitle} from "components/ui/dialog";
import Link from "next/link";
import RadarMap from "components/radars/RadarMap.tsx";
import { useServerData } from "../../app/servers/[server_slug]/ServerDataProvider";
import { LucideFullscreen, LucideX, LucideExternalLink } from "lucide-react";
import {useTranslations} from 'next-intl';

export const LIGHT_BASEMAP = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DARK_BASEMAP  = 'https://basemap.queeniemella.cc/tiles/countries/{z}/{x}/{y}.png';
export const WMS_URL = "/qgis-server";
export const WMS_PLAYER_MAPPED_NOW_URL = "/wms/player_live/now";

export function formWMSUrl(serverId, isLive, time = null){
    if (isLive){
        return `${WMS_URL}?FILTER=player_server_mapped,player_server_mapped:"server_id" = '${serverId}'`
    }
    if (time)
        return `${WMS_URL}?TIME=${time}&FILTER=player_server_timed,player_server_timed:"server_id" = '${serverId}'`
    return `${WMS_URL}?FILTER=player_server_timed,player_server_timed:"server_id" = '${serverId}'`
}

function RadarPreviewDisplay({ dateDisplay }){
    const t = useTranslations('radar');
    const { server } = useServerData()

    return (
        <div className="relative">
            <div className="absolute top-1 right-1 flex items-center gap-4 z-500">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                asChild
                                variant="ghost"
                            >
                                <Link href={`/servers/${server.gotoLink}/radar`}>
                                    <LucideExternalLink />
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('historicalRadar')}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <Dialog>
                            <TooltipTrigger asChild>
                                <DialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                    >
                                        <LucideFullscreen />
                                    </Button>
                                </DialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>{t('fullscreen')}</TooltipContent>
                            <DialogTitle className="hidden">
                                {t('mapOfSelectedTime')}
                            </DialogTitle>
                            <DialogContent className="sm:max-w-[95vw] w-full h-full p-0 z-1000">
                                <RadarMap dateDisplay={dateDisplay} height="100vh" fullscreen={true} />

                                <div className="absolute top-4 right-4 flex items-center gap-4 z-1050">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                asChild
                                                variant='outline'
                                                className="accent-secondary"
                                            >
                                                <Link href={`/servers/${server.gotoLink}/radar`}>
                                                    <LucideExternalLink />
                                                </Link>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('historicalRadar')}</TooltipContent>
                                    </Tooltip>

                                    <DialogClose asChild>
                                        <Button
                                            variant="outline"
                                            className="accent-secondary"
                                        >
                                            <LucideX />
                                        </Button>
                                    </DialogClose>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </Tooltip>
                </TooltipProvider>
            </div>

            <div className="rounded-md overflow-hidden">
                <RadarMap dateDisplay={dateDisplay} height="37vh" />
            </div>

        </div>
    );
}

export default function RadarPreview({ dateDisplay }){
    return (
        <ErrorCatch>
            <RadarPreviewDisplay dateDisplay={dateDisplay} />
        </ErrorCatch>
    )
}
