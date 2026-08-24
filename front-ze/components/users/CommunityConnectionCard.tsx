'use client';

import { ProfileCommunityDetail, UserAnonymization } from "types/community";
import { getServerAvatarText } from "../ui/CommunitySelector";
import { secondsToHours } from "utils/generalUtils";
import Link from "next/link";
import { Card, CardContent } from "components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar";
import { Switch } from "components/ui/switch";
import { Label } from "components/ui/label";
import { Separator } from "components/ui/separator";
import { Badge } from "components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/ui/collapsible";
import { Clock, ChevronDown, Info } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import ServerSessionStrip from "./ServerSessionStrip";

interface CommunityConnectionCardProps {
    community: ProfileCommunityDetail;
    settings: UserAnonymization | null;
    onToggleAnonymize: (communityId: string | number, type: "location" | "anonymous", value: boolean, settings: UserAnonymization | null) => void;
    showAnonymizeToggle?: boolean;
    /** Session length that saturates a heatmap cell, shared across the whole profile. */
    scaleMax: number;
}

function LinkedNamesPanel({ names }: { names: { name: string; total_playtime: number; is_current: boolean }[] }) {
    const t = useTranslations('players.profile.connectionCard');
    const [open, setOpen] = useState(false);
    if (names.length <= 1) return null;

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-amber-500 hover:underline">
                {t('linkedNames', { count: names.length })}
                <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {names.map((n) => (
                            <div key={n.name} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                                <span className="font-medium">{n.name}</span>
                                <span className="text-muted-foreground">{secondsToHours(n.total_playtime)} {t('hoursUnit')}</span>
                                {n.is_current && (
                                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">{t('current')}</Badge>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{t('renameNotice')}</span>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

export default function CommunityConnectionCard({
    community,
    settings,
    onToggleAnonymize,
    showAnonymizeToggle = false,
    scaleMax,
}: CommunityConnectionCardProps) {
    const t = useTranslations('players.profile.connectionCard');
    const totalPlaytime = community.servers.reduce(
        (sum, s) => sum + s.player.total_playtime, 0
    );
    const isOnlineHere = community.servers.some(s => s.is_online);
    const hasAnyPlaytime = totalPlaytime > 0;

    return (
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardContent className="p-4 sm:p-6">
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Avatar className="h-12 w-12 sm:h-14 sm:w-14">
                                {community.icon_url && (
                                    <AvatarImage src={community.icon_url} alt={community.name} />
                                )}
                                <AvatarFallback className="text-base sm:text-lg font-bold">
                                    {getServerAvatarText(community.name)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base sm:text-xl font-semibold break-words">
                                    {community.name}
                                </h3>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    <div className="flex items-center gap-1">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">
                                            {secondsToHours(totalPlaytime)} {t('hoursUnit')}
                                        </span>
                                    </div>
                                    {isOnlineHere && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-sm text-green-500">
                                                {t('onlineNow')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {showAnonymizeToggle && hasAnyPlaytime && (
                            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id={`hide-location-${community.id}`}
                                        checked={settings?.hide_location ?? false}
                                        onCheckedChange={(checked) => onToggleAnonymize(
                                            community.id, "location", checked, settings
                                        )}
                                    />
                                    <Label
                                        htmlFor={`hide-location-${community.id}`}
                                        className="text-sm text-muted-foreground cursor-pointer"
                                    >
                                        {t('hideRadar')}
                                    </Label>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Switch
                                        id={`anonymize-${community.id}`}
                                        checked={settings?.anonymized ?? false}
                                        onCheckedChange={(checked) => onToggleAnonymize(
                                            community.id, "anonymous", checked, settings
                                        )}
                                    />
                                    <Label
                                        htmlFor={`anonymize-${community.id}`}
                                        className="text-sm text-muted-foreground cursor-pointer"
                                    >
                                        {t('anonymize')}
                                    </Label>
                                </div>
                            </div>
                        )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground">
                            {t('servers')}
                        </h4>
                        {community.servers.map((serverPlayer) => (
                            <div
                                key={serverPlayer.server_id}
                                className={`pl-4 border-l-2 border-border rounded-sm p-2 -ml-2 transition-all duration-200 ${
                                    serverPlayer.player.total_playtime > 0 ? 'hover:border-primary hover:translate-x-1' : ''
                                }`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {serverPlayer.player.total_playtime > 0 ? (
                                                <Link
                                                    href={`/servers/${serverPlayer.server_id}/players/${serverPlayer.player.id}`}
                                                    className="text-sm font-medium hover:underline"
                                                >
                                                    {serverPlayer.server_name}
                                                </Link>
                                            ) : (
                                                <p className="text-sm font-medium">
                                                    {serverPlayer.server_name}
                                                </p>
                                            )}
                                            <Badge variant={serverPlayer.by_id ? "secondary" : "outline"} className="text-[10px]">
                                                {serverPlayer.by_id ? t('steamId') : t('nameMatched')}
                                            </Badge>
                                            {serverPlayer.is_online && (
                                                <div className="flex items-center gap-1.5 text-xs text-green-500">
                                                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                                                    <span>{t('onlineHere')}</span>
                                                </div>
                                            )}
                                        </div>

                                        {serverPlayer.player.total_playtime > 0 ? (
                                            <div className="flex items-center gap-1">
                                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                                <span className="text-xs text-muted-foreground">
                                                    {secondsToHours(serverPlayer.player.total_playtime)} {t('hoursUnit')}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground/60">
                                                {t('noPlaytime')}
                                            </span>
                                        )}

                                        <LinkedNamesPanel names={serverPlayer.linked_names} />
                                    </div>

                                    <div className="shrink-0">
                                        <ServerSessionStrip
                                            sessions={serverPlayer.recent_sessions}
                                            scaleMax={scaleMax}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
