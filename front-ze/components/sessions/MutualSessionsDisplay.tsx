'use client'
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardContent } from 'components/ui/card';
import { Skeleton, SkeletonText, varyWidth } from 'components/ui/skeleton';
import { PlayerAvatar } from "../players/PlayerAvatar";
import { MutualSessionReturn, SessionType } from "../../app/servers/[server_slug]/util";
import { Server } from "types/community";
import { PlayerBrief, PlayerSeen } from "types/players";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {range} from "utils/generalUtils";

const PAGE_SIZE = 30;
const ROW = "flex items-center gap-4 p-4 border-b last:border-0";
const ROW_BODY = "flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4";

/** Without `mutualSessions` it renders as its own loading skeleton. */
export default function MutualSessionsDisplay<T extends SessionType>(
    { server, mutualSessions, type }:
    { server?: Server, mutualSessions?: MutualSessionReturn<T>, type: T }
) {
    const t = useTranslations('sessions');
    const [page, setPage] = useState(0);
    const isPlayer = type === 'player';
    const totalPages = Math.ceil((mutualSessions?.length ?? 0) / PAGE_SIZE);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>
                        {isPlayer ? t('mutualSessions') : t('players')}
                    </CardTitle>

                    {!mutualSessions && <Skeleton className="h-9 w-44" />}
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <PaginationPage totalPages={totalPages} page={page} setPage={setPage} compact />
                        </div>
                    )}
                </div>
            </CardHeader>

            <CardContent className="p-0">
                {mutualSessions?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((player: PlayerSeen | PlayerBrief) => (
                    <div key={player.id} className={`${ROW} hover:bg-accent transition-colors`}>
                        <PlayerAvatar uuid={player.id} name={player.name} />
                        <div className={ROW_BODY}>
                            <div className="min-w-0">
                                <HoverPrefetchLink className="font-medium truncate max-w-[10rem] lg:max-w-[15rem] hover:underline"
                                                   href={`/servers/${server.gotoLink}/players/${player.id}`}>
                                    {player.name}
                                </HoverPrefetchLink>
                                <p className="text-sm text-muted-foreground hidden sm:block">
                                    {player.id}
                                </p>
                            </div>
                            <div className="text-sm font-semibold text-primary flex-shrink-0">
                                {t('minutesValue', {value: (player[isPlayer ? 'total_time_together' : 'total_playtime'] / 60).toFixed(1)})}
                            </div>
                        </div>
                    </div>
                ))}
                {!mutualSessions && range(PAGE_SIZE).map(i => (
                    <div key={i} className={ROW}>
                        <Skeleton className="w-[40px] h-[40px] rounded-[8%] flex-shrink-0" />
                        <div className={ROW_BODY}>
                            <div className="min-w-0">
                                <div className="font-medium">
                                    <SkeletonText className="h-4" style={varyWidth(i)} />
                                </div>
                                <div className="text-sm hidden sm:block">
                                    <SkeletonText className="h-3.5 w-36" />
                                </div>
                            </div>
                            <div className="text-sm font-semibold flex-shrink-0">
                                <SkeletonText className="h-3.5 w-16" />
                            </div>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
