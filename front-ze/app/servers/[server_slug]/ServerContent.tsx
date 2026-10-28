'use client'
import {useLocale, useTranslations} from 'next-intl';
import { useState, Activity, Suspense, ReactNode } from "react";
import PlayerList from "components/players/PlayerList.tsx";
import MapGraphList, {MapGraphListLoading} from "components/maps/MapGraphList.tsx";
import dynamic from "next/dynamic";
import {Play} from "lucide-react";
import Link from "next/link";
import dayjs from "lib/dayjs";
import { cn } from "components/lib/utils";

import {DateSources, useDateState} from "components/graphs/DateStateManager";
import {Server} from "types/community";
import {ServerMapPlayedPaginated} from "types/maps";
import {getServerAvatarText} from "components/ui/CommunitySelector.tsx";
import { Avatar, AvatarImage, AvatarFallback } from "components/ui/avatar";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Progress } from "components/ui/progress";
import InfoTooltip from "components/common/InfoTooltip";
const RadarPreview = dynamic(() => import("components/radars/RadarPreview.tsx"), {
    ssr: false,
});
const ServerGraph = dynamic(() => import("components/graphs/ServerGraph"), {
    ssr: false,
});

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

function MetaCard({ span, title, tooltip, value, className, children }: {
    span: string, title: string, tooltip?: string, value: ReactNode, className?: string, children?: ReactNode,
}) {
    return (
        <div className={span}>
            <Card className={cn("h-full", className)}>
                <CardContent className="p-0">
                    <div className="flex flex-row justify-between items-center gap-2">
                        <h3 className="text-sm md:text-base font-bold truncate">
                            {title}
                        </h3>
                        {tooltip && <InfoTooltip text={tooltip} />}
                    </div>
                    <p className="mt-2">{value}</p>
                    {children}
                </CardContent>
            </Card>
        </div>
    );
}

function ExternalLink({ href, children }: { href: string, children: ReactNode }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>;
}

export default function ServerContent({ server, description, mapSessionsPromise }: {
    server: Server,
    description: string,
    mapSessionsPromise: Promise<ServerMapPlayedPaginated | null>,
}) {
    const t = useTranslations('servers.content');
    const locale = useLocale();
    const [ showPlayers, setShowPlayers ] = useState<boolean>(false);
    const [graphLoading, setGraphLoading] = useState<boolean>(false);
    const { start, end, setDates } = useDateState();

    const metaCards = 1 + Number(!!server.tracking_since) + Number(!!server.website) + Number(!!server.discordLink)
    const metaSpan = META_SPAN[metaCards]

    return (
        <div className="grid grid-cols-12 gap-3">
            <div className={DESC_SPAN[metaCards]}>
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
            <MetaCard
                span={metaSpan}
                title={t('dataSource')}
                tooltip={server.byId ? t('trackedBySteamId') : t('trackedByName')}
                value={server.source ? <ExternalLink href={server.source}>{new URL(server.source).hostname}</ExternalLink> : t('steamBrowser')}
            />
            {server.tracking_since && (
                <MetaCard
                    span={metaSpan}
                    title={t('trackingSince')}
                    tooltip={t('trackingSinceTooltip')}
                    value={new Date(server.tracking_since).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })}
                >
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {dayjs(server.tracking_since).fromNow()}
                    </p>
                </MetaCard>
            )}
            {server.website && (
                <MetaCard
                    span={metaSpan}
                    title={t('website')}
                    value={<ExternalLink href={server.website}>{new URL(server.website).hostname}</ExternalLink>}
                />
            )}
            {server.discordLink && (
                <MetaCard
                    span={metaSpan}
                    title={t('discord')}
                    className="px-3"
                    value={<ExternalLink href={server.discordLink}>{t('inviteLink')}</ExternalLink>}
                />
            )}
            <div className={cn(
                "col-span-12",
                showPlayers ? "md:col-span-12 xl:col-span-9" : "md:col-span-12"
            )}>
                <Card className="min-h-[516px] min-[501px]:min-h-[682px] sm:min-h-[650px]">
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
                    <Suspense fallback={<MapGraphListLoading />}>
                        <MapGraphList
                            onDateChange={(newStart, newEnd) => setDates(newStart, newEnd.add(1, 'minutes'), DateSources.EXTERNAL)}
                            initialDataPromise={mapSessionsPromise}
                        />
                    </Suspense>
                </Card>
            </div>
            <div className="col-span-12 md:col-span-12 xl:col-span-3">
                <Card className="relative h-full min-h-[336px] p-0">
                    <RadarPreview dateDisplay={{ start, end }} />
                </Card>
            </div>
        </div>
    );
}
