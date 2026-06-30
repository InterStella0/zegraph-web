'use client'

import ErrorCatch from "../ui/ErrorMessage.tsx";
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import {Dialog, DialogContent, DialogTrigger, DialogClose, DialogTitle} from "components/ui/dialog";
import Link from "next/link";
import RadarMap from "components/radars/RadarMap.tsx";
import { useServerData } from "../../app/servers/[server_slug]/ServerDataProvider";
import { LucideFullscreen, LucideX, LucideExternalLink } from "lucide-react";

export const lightBasemap = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const darkBasemap  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const WMS_URL = "/qgis-server";

export function formWMSUrl(serverId, isLive, time = null){
    if (isLive){
        return `${WMS_URL}?FILTER=player_server_mapped,player_server_mapped:"server_id" = '${serverId}'`
    }
    if (time)
        return `${WMS_URL}?TIME=${time}&FILTER=player_server_timed,player_server_timed:"server_id" = '${serverId}'`
    return `${WMS_URL}?FILTER=player_server_timed,player_server_timed:"server_id" = '${serverId}'`
}

function RadarPreviewDisplay({ dateDisplay }){
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
                        <TooltipContent>Historical Radar</TooltipContent>
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
                            <TooltipContent>Fullscreen</TooltipContent>
                            <DialogTitle className="hidden">
                                Map of the selected time
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
                                        <TooltipContent>Historical Radar</TooltipContent>
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
