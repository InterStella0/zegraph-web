'use client'
import {useTranslations} from 'next-intl';
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useEffect, useState} from "react";
import {getMapImage} from "utils/generalUtils.ts";
import dayjs from "dayjs";
import Image from "next/image";
import {ServerMapPlayed} from "types/maps.ts";
import {Server} from "types/community.ts";
import {Loader2, ImageOff, LineChart, ArrowUpRight} from "lucide-react";
import Link from "next/link";
import {Button} from "components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";

type MapCardProps = {
    detail: ServerMapPlayed,
    onClick: (detail: ServerMapPlayed) => void,
    server: Server,
}

export default function MapCard({ detail, onClick, server }: MapCardProps){
    return <ErrorCatch message="Failed to display this map.">
        <MapCardDisplay detail={detail} onClick={onClick} server={server} />
    </ErrorCatch>
}
function MapCardDisplay({ detail, onClick, server }){
    const [image, setImage] = useState<string | null>()
    const server_id = server.id
    const t = useTranslations('maps');
    useEffect(() => {
        getMapImage(server_id, detail.map).then(e => setImage(e? e.small: null))
    }, [server_id, detail])
    const startedAt = dayjs(detail.started_at)
    const endedAt = detail.ended_at != null? dayjs(detail.ended_at): dayjs()
    const duration = endedAt.diff(startedAt, 'minutes')

    return (
        <div
            key={detail.time_id}
            className="flex-shrink-0 w-[180px] rounded-lg border border-border bg-card overflow-hidden
                       transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        >
            <div className="relative w-full h-[100px]">
                {(image === undefined || image === null) && (
                    <div className="flex justify-center items-center h-full">
                        {image === undefined && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
                        {image === null && <ImageOff className="h-8 w-8 text-muted-foreground" />}
                    </div>
                )}
                {image !== undefined && image !== null && (
                    <Image
                        unoptimized
                        src={image}
                        alt={`Image of ${detail.map}`}
                        title={detail.map}
                        loading="lazy"
                        height={100}
                        width={180}
                        className="object-cover block"
                    />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <span className="absolute bottom-2 right-2 text-xs text-white bg-black/50 px-1.5 py-0.5 rounded">
                        {duration}m
                    </span>
                </div>
            </div>

            <div className="p-3">
                <p className="font-semibold text-sm mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    {detail.map}
                </p>
                <div className="flex justify-between items-center text-xs mb-2">
                    <div className="flex flex-col items-start">
                        <span className="text-muted-foreground text-xs">{startedAt.format('L LT')}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="flex-1 px-2"
                                onClick={()  => onClick(detail)}
                            >
                                <LineChart className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('graph')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button asChild variant="outline" size="sm" className="flex-1 px-2">
                                <Link href={`/servers/${server.gotoLink}/maps/${detail.map}/sessions/${detail.time_id}`}>
                                    <ArrowUpRight className="h-4 w-4" />
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('details')}</TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}
