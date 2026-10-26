'use client';

import { UserAnonymization } from "types/community";
import { formatNumber, secondsToHours } from "utils/generalUtils";
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar";
import { Switch } from "components/ui/switch";
import { Label } from "components/ui/label";
import { Badge } from "components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/ui/collapsible";
import { Button } from "components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "components/ui/dialog";
import { ArrowUpRight, ChevronDown, Crosshair, Info, Loader2, Merge } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { sendJson } from "lib/sendJson";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import { cn } from "components/lib/utils";
import ServerSessionStrip from "./ServerSessionStrip";
import { ProfileCommunity, useProfileCommunities } from "./ProfileContext";
import { COLLAPSE, SWAP, stagger } from "./profileMotion";
import { tint } from "./profileChart";

export type AnonymizeType = "location" | "anonymous";

interface CommunityConnectionCardProps {
    community: ProfileCommunity;
    share: number;
    settings: UserAnonymization | null;
    onToggleAnonymize: (communityId: string, type: AnonymizeType, value: boolean, settings: UserAnonymization | null) => void;
    showAnonymizeToggle?: boolean;
    scaleMax: number;
    defaultOpen?: boolean;
    index?: number;
}

export const CONNECTION_COLUMNS = "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] md:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1fr)_7rem_1rem] items-center gap-x-4";

function CommunityBadge({ community }: { community: ProfileCommunity }) {
    return (
        <Avatar className="size-10">
            {community.iconUrl && <AvatarImage src={community.iconUrl} alt={community.name} />}
            <AvatarFallback
                className="text-xs font-bold"
                style={{ backgroundColor: tint(community.color, 0.18), color: community.color }}
            >
                {community.tag}
            </AvatarFallback>
        </Avatar>
    );
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
            <CollapsibleContent className={COLLAPSE}>
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

function MergeAccountsButton({ serverId, serverName, count }: { serverId: string; serverName: string; count: number }) {
    const t = useTranslations('players.profile.connectionCard.merge');
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const merge = async () => {
        setSubmitting(true);
        try {
            const result: { merged_profiles: number; sessions_moved: number } =
                await sendJson('/accounts/me/merge', 'POST', { server_id: serverId });
            toast.success(t('success', { count: result.merged_profiles, sessions: result.sessions_moved }));
            setOpen(false);
            router.refresh();
        } catch (error: any) {
            toast.error(t('failed'), { description: error?.message });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => setOpen(true)}>
                <Merge className="h-3.5 w-3.5" />
                {t('button', { count })}
            </Button>
            <Dialog open={open} onOpenChange={(isOpen) => { if (!submitting) setOpen(isOpen); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('title')}</DialogTitle>
                        <DialogDescription>{t('description', { count, server: serverName })}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={merge} disabled={submitting}>
                            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {t('confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function CommunityConnectionCard({
    community,
    share,
    settings,
    onToggleAnonymize,
    showAnonymizeToggle = false,
    scaleMax,
    defaultOpen = false,
    index = 0,
}: CommunityConnectionCardProps) {
    const t = useTranslations('players.profile.connectionCard');
    const tFocus = useTranslations('players.profile.focus');
    const locale = useLocale();
    const toDayjs = useLocalDayjs();
    const { focused, setFocused } = useProfileCommunities();
    const [open, setOpen] = useState(defaultOpen);
    const { detail } = community;
    const isOnlineHere = detail.servers.some(s => s.is_online);
    const lastPlayed = detail.servers.map(s => s.last_played).filter(Boolean).sort().at(-1);
    const isFocused = focused === community.id;

    return (
        <Collapsible
            open={open}
            onOpenChange={setOpen}
            className={cn("border-t border-border/60 first:border-t-0", SWAP)}
            style={stagger(index, 60)}
        >
            <CollapsibleTrigger className={cn(CONNECTION_COLUMNS, "w-full px-4 py-3 text-left transition-colors hover:bg-muted/40")}>
                <CommunityBadge community={community} />
                <span className="block min-w-0">
                    <span className="block truncate font-semibold">{community.name}</span>
                    <span className="block truncate text-xs text-muted-foreground" suppressHydrationWarning>
                        {t('serverCount', { count: detail.servers.length })}
                        {" · "}
                        {isOnlineHere
                            ? <span className="text-green-500">{t('onlineNow')}</span>
                            : lastPlayed
                                ? t('lastPlayed', { time: toDayjs(lastPlayed).fromNow() })
                                : t('noPlaytime')}
                    </span>
                </span>
                <span className="col-span-2 col-start-2 row-start-2 mt-2 block min-w-0 md:col-span-1 md:col-start-auto md:row-start-auto md:mt-0">
                    <span className="block text-sm">
                        <span className="font-semibold tabular-nums">{secondsToHours(community.playtime, locale)}</span>
                        <span className="text-xs text-muted-foreground"> {t('hoursUnit')} · {formatNumber(share * 100, 1, locale)}%</span>
                    </span>
                    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <span className="block h-full origin-left rounded-full motion-safe:animate-bar-grow" style={{ width: `${share * 100}%`, backgroundColor: community.color }} />
                    </span>
                </span>
                <span className="block text-right">
                    {detail.rank ? (
                        <>
                            <span className="block font-bold tabular-nums" style={{ color: community.color }}>
                                #{formatNumber(detail.rank.rank, 0, locale)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                                {t('rankOf', { total: formatNumber(detail.rank.total_players, 0, locale) })}
                            </span>
                        </>
                    ) : (
                        <span className="block text-xs text-muted-foreground">{t('unranked')}</span>
                    )}
                </span>
                <ChevronDown className={cn("hidden size-4 text-muted-foreground transition-transform md:block", open && "rotate-180")} />
            </CollapsibleTrigger>

            <CollapsibleContent className={COLLAPSE}>
                <div className="space-y-2 px-4 pb-4 md:pl-[4.5rem]">
                    {detail.servers.map((serverPlayer) => (
                        <div
                            key={serverPlayer.server_id}
                            className="rounded-lg border border-border/60 bg-background/40 p-3 transition-all duration-200 hover:translate-x-1 hover:border-primary/50"
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {serverPlayer.player.total_playtime > 0 ? (
                                            <Link
                                                href={`/servers/${serverPlayer.server_id}/players/${serverPlayer.player.id}`}
                                                className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                                            >
                                                {serverPlayer.server_name}
                                                <ArrowUpRight className="size-3.5" />
                                            </Link>
                                        ) : (
                                            <p className="text-sm font-medium">{serverPlayer.server_name}</p>
                                        )}
                                        <Badge variant={serverPlayer.by_id ? "secondary" : "outline"} className="text-[10px]">
                                            {serverPlayer.by_id ? t('steamId') : t('nameMatched')}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {serverPlayer.player.total_playtime > 0
                                                ? `${secondsToHours(serverPlayer.player.total_playtime, locale)} ${t('hoursUnit')}`
                                                : t('noPlaytime')}
                                        </span>
                                        {serverPlayer.is_online && (
                                            <span className="flex items-center gap-1.5 text-xs text-green-500">
                                                <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-green-500" />
                                                {t('onlineHere')}
                                            </span>
                                        )}
                                    </div>

                                    <LinkedNamesPanel names={serverPlayer.linked_names} />
                                    {/* Only a fork (renamed under a second name) has anything to merge. With a
                                        single name, merging would just turn that name into an alias and fork the
                                        next join instead. */}
                                    {serverPlayer.mergeable_count > 0 && serverPlayer.linked_names.length > 1 && (
                                        <MergeAccountsButton
                                            serverId={serverPlayer.server_id}
                                            serverName={serverPlayer.server_name}
                                            count={serverPlayer.mergeable_count}
                                        />
                                    )}
                                </div>

                                <div className="shrink-0">
                                    <ServerSessionStrip
                                        sessions={serverPlayer.recent_sessions}
                                        scaleMax={scaleMax}
                                        color={community.color}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                        {showAnonymizeToggle && community.playtime > 0 ? (
                            <div className="flex flex-wrap gap-4">
                                {([
                                    ["location", "hide-location", settings?.hide_location, t('hideRadar')],
                                    ["anonymous", "anonymize", settings?.anonymized, t('anonymize')],
                                ] as const).map(([type, idPrefix, checked, label]) => (
                                    <div key={type} className="flex items-center gap-2">
                                        <Switch
                                            id={`${idPrefix}-${community.id}`}
                                            checked={checked ?? false}
                                            onCheckedChange={value => onToggleAnonymize(community.id, type, value, settings)}
                                        />
                                        <Label htmlFor={`${idPrefix}-${community.id}`} className="text-sm text-muted-foreground cursor-pointer">
                                            {label}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        ) : <span />}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="self-start sm:self-auto"
                            style={{ color: community.color }}
                            onClick={() => setFocused(isFocused ? null : community.id)}
                        >
                            <Crosshair className="size-4" />
                            {tFocus(isFocused ? 'unfocus' : 'focusOn', { community: community.tag })}
                        </Button>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
