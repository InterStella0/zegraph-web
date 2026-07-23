'use client'
import {useTranslations} from 'next-intl';
import { useState, Activity } from "react";
import PlayerList from "components/players/PlayerList.tsx";
import MapGraphList from "components/maps/MapGraphList.tsx";
import dynamic from "next/dynamic";
import {Info, Play} from "lucide-react";
import Link from "next/link";
import { cn } from "components/lib/utils";

import {DateSources, useDateState} from "components/graphs/DateStateManager";
import {Server} from "types/community";
import {getServerAvatarText} from "components/ui/CommunitySelector.tsx";
import { Avatar, AvatarImage, AvatarFallback } from "components/ui/avatar";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import { Progress } from "components/ui/progress";
import ServerTrackingSince from "./ServerTrackingSince";
const RadarPreview = dynamic(() => import("components/radars/RadarPreview.tsx"), {
    ssr: false,
});
const ServerGraph = dynamic(() => import("components/graphs/ServerGraph"), {
    ssr: false,
});

// The metadata row holds 1-4 cards (Data Source is always there; Tracking Since, Website and
// Discord are conditional). Every breakpoint below is chosen so the description card plus the
// metadata cards tile to exactly 12 columns with no leftover gap:
//
//   n | base        | sm             | lg             | xl
//   1 | 12 | 12     | 12 | 12        | 9 + 3          | 10 + 2
//   2 | 12 | 12,12  | 12 | 6+6       | 6 + 3+3        | 8  + 2x2
//   3 | 12 | 12x3   | 12 | 4+4+4     | 12 | 4+4+4     | 6  + 2x3
//   4 | 12 | 12x4   | 12 | 6+6,6+6   | 12 | 3+3+3+3   | 4  + 2x4
//
// The description only shares a row with the cards once there is room for both (lg for 1-2 cards,
// xl for all of them); below that it takes a full row of its own. Tailwind cannot see interpolated
// class names, so both sides have to be static lookups rather than computed strings.
const DESC_SPAN = {
    1: "col-span-12 lg:col-span-9 xl:col-span-10",
    2: "col-span-12 lg:col-span-6 xl:col-span-8",
    3: "col-span-12 lg:col-span-12 xl:col-span-6",
    4: "col-span-12 lg:col-span-12 xl:col-span-4",
} as const

const META_SPAN = {
    1: "col-span-12 lg:col-span-3 xl:col-span-2",
    2: "col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-2",
    3: "col-span-12 sm:col-span-4 lg:col-span-4 xl:col-span-2",
    4: "col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-2",
} as const

export default function ServerContent({ server, description }: {server: Server, description: string}) {
    const t = useTranslations('servers.content');
    const [ showPlayers, setShowPlayers ] = useState<boolean>(false);
    const [graphLoading, setGraphLoading] = useState<boolean>(false);
    const { start, end, setDates } = useDateState();

    const handleDateForceChange = (newStart, newEnd) => {
        setDates(newStart, newEnd.add(1, 'minutes'), DateSources.EXTERNAL);
    };

    const hasDiscord = !!server.discordLink
    const hasWebsite = !!server.website
    const hasTracking = !!server.tracking_since

    const metaCards = 1 + Number(hasTracking) + Number(hasWebsite) + Number(hasDiscord)
    const descSpan = DESC_SPAN[metaCards]
    const metaSpan = META_SPAN[metaCards]

    return (
        <TooltipProvider>
            <div className="grid grid-cols-12 gap-3">
                <div className={descSpan}>
                    <Card className="h-full w-full">
                        <CardContent className="p-0">
                            <div className="flex flex-row items-center justify-center gap-2">
                                <Avatar className="w-10 h-10 sm:w-12 sm:h-12">
                                    <AvatarImage src={server.community_icon} alt={server.community_name} />
                                    <AvatarFallback className="text-sm sm:text-base font-bold">
                                        {getServerAvatarText(server.community_name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="text-sm md:text-base">
                                        {description}
                                    </p>
                                    {server.status &&
                                        <Button
                                            variant="default"
                                            size="sm"
                                            asChild
                                            className="my-2"
                                        >
                                            <Link href={`/connect/${server.id}`}>
                                                <Play className="mr-2 h-4 w-4" />
                                                {t('join')}
                                            </Link>
                                        </Button>
                                    }
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <div className={metaSpan}>
                    <Card className="h-full">
                        <CardContent className="p-0">
                            <div className="flex flex-row justify-between items-center gap-2">
                                <h3 className="text-sm md:text-base font-bold truncate">
                                    {t('dataSource')}
                                </h3>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <Info className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{server.byId ? t('trackedBySteamId') : t('trackedByName')}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <p className="mt-2">
                                {server.source ? (
                                    <a href={server.source} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                        {new URL(server.source).hostname}
                                    </a>
                                ) : (
                                    t('steamBrowser')
                                )}
                            </p>
                        </CardContent>
                    </Card>
                </div>
                {hasTracking && (
                    <div className={metaSpan}>
                        <ServerTrackingSince trackingSince={server.tracking_since} />
                    </div>
                )}
                {hasWebsite && (
                    <div className={metaSpan}>
                        <Card className="h-full">
                            <CardContent className="p-0">
                                <h3 className="text-sm md:text-base font-bold truncate">
                                    {t('website')}
                                </h3>
                                <p className="mt-2">
                                    <a href={server.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                        {new URL(server.website).hostname}
                                    </a>
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}
                {hasDiscord && (
                    <div className={metaSpan}>
                        <Card className="h-full px-3">
                            <CardContent className="p-0">
                                <h3 className="text-sm md:text-base font-bold truncate">
                                    {t('discord')}
                                </h3>
                                <p className="mt-2">
                                    <a href={server.discordLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                        {t('inviteLink')}
                                    </a>
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}
                <div className={cn(
                    "col-span-12",
                    showPlayers ? "md:col-span-12 xl:col-span-9" : "md:col-span-12"
                )}>
                    <Card className="min-h-[516px]">
                        <ServerGraph setLoading={setGraphLoading} setShowPlayers={setShowPlayers} />
                        {graphLoading && <Progress value={undefined} className="h-1" />}
                    </Card>
                </div>
                <Activity mode={showPlayers ? 'visible' : 'hidden'}>
                    <div className="col-span-12 md:col-span-12 xl:col-span-3">
                        <Card>
                            <PlayerList dateDisplay={{start, end}}/>
                        </Card>
                    </div>
                </Activity>

                <div className="col-span-12 md:col-span-12 xl:col-span-9">
                    <Card className="min-h-[336px]">
                        <MapGraphList onDateChange={handleDateForceChange} />
                    </Card>
                </div>
                <div className="col-span-12 md:col-span-12 xl:col-span-3">
                    <Card className="min-h-[336px] p-0">
                        <RadarPreview dateDisplay={{ start, end }} />
                    </Card>
                </div>
            </div>
        </TooltipProvider>
    );
}