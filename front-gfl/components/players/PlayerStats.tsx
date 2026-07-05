'use client'
import {useTranslations} from 'next-intl';
import {ReactElement, use, useState} from "react";
import { Card } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Skeleton } from "components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "components/ui/tabs";
import {formatHours} from "utils/generalUtils";
import {PlayerWithLegacyRanks} from "types/players";
import {PlayerInfo} from "../../app/servers/[server_slug]/players/[player_id]/util.ts";

export default function PlayerStats({ cStatsPromise, player }: { cStatsPromise: Promise<PlayerWithLegacyRanks | null>, player: PlayerInfo}): ReactElement{
    const t = useTranslations('players.stats');
    const cStats = use(cStatsPromise)
    const [activeTab, setActiveTab] = useState<string>("playtime");

    return <Card className="ml-0 sm:ml-4 mt-6 sm:mt-0 min-w-full sm:min-w-[250px] overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-2 rounded-none border-b h-auto">
                <TabsTrigger value="playtime" className="text-sm">
                    {t('playTime')}
                </TabsTrigger>
                {cStats && (
                    <TabsTrigger value="csgostats" className="text-sm">
                        {t('csgoStats')}
                    </TabsTrigger>
                )}
            </TabsList>

            <TabsContent value="playtime" className="p-4 mt-0">
                {player ? (
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                                {t('total')}
                            </span>
                            <span className="text-sm font-medium">
                                {formatHours(player.total_playtime)}
                            </span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                                {t('casual')}
                            </span>
                            <span className="text-sm font-medium">
                                {formatHours(player.casual_playtime)}
                            </span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                                {t('tryHard')}
                            </span>
                            <span className="text-sm font-medium">
                                {formatHours(player.tryhard_playtime)}
                            </span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                                {t('others')}
                            </span>
                            <span className="text-sm font-medium">
                                {formatHours(Math.max(player.total_playtime - (player.tryhard_playtime + player.casual_playtime), 0))}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-full" />
                    </div>
                )}
            </TabsContent>

            {cStats && (
                <TabsContent value="csgostats" className="p-4 mt-0">
                    <div className="mb-4 flex justify-end">
                        <Badge variant="secondary" className="h-5 px-2">
                            {t('untracked')}
                        </Badge>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                                {t('playTimeColon')}
                            </span>
                            <span className="text-sm font-medium">
                                {formatHours(cStats.human_time + cStats.zombie_time)}
                            </span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                                {t('headshots')}
                            </span>
                            <span className="text-sm font-medium">
                                {cStats.headshot}
                            </span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                                {t('leaderCount')}
                            </span>
                            <span className="text-sm font-medium">
                                {cStats.leader_count}
                            </span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                                {t('totalPoints')}
                            </span>
                            <span className="text-sm font-medium">
                                {cStats.points.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </TabsContent>
            )}
        </Tabs>
    </Card>
}