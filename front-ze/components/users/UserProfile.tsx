'use client';

import { ProfileResponse } from "types/community";
import { PlayerProfilePicture } from "types/players";
import { UserAvatar } from "./UserAvatar";
import { use } from "react";
import { usePathname } from "next/navigation";
import { SiSteam } from "@icons-pack/react-simple-icons";
import { Card, CardContent } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import { Button } from "components/ui/button";
import { Badge } from "components/ui/badge";
import { Loader2, Share2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "components/ui/tooltip";

interface UserProfileProps {
    profilePromise: Promise<ProfileResponse>;
    pfpPromise?: Promise<PlayerProfilePicture | null>;
}

export function UserProfileLoading() {
    return (
        <Card className="w-full border-border/40 bg-card/50 backdrop-blur-xl">
            <CardContent className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <Skeleton className="h-[120px] w-[120px] shrink-0 rounded-[8%]" />
                    <div className="flex flex-col flex-1 items-center sm:items-start gap-3">
                        <div className="space-y-2">
                            <div className="flex items-center justify-center sm:justify-start gap-3">
                                <Skeleton className="h-9 sm:h-10 w-48" />
                                <Skeleton className="h-[50px] w-[50px] rounded-full" />
                            </div>
                            <Skeleton className="h-5 w-56" />
                        </div>
                    </div>
                    <div className="flex flex-col items-center sm:items-end gap-1.5 sm:self-start sm:ml-auto">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-9 w-20" />
                        <Skeleton className="h-4 w-28" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function UserProfile({ profilePromise, pfpPromise }: UserProfileProps) {
    const t = useTranslations('players.profile.header');
    const profile = use(profilePromise);
    const { steamid, name } = profile;
    const { rank, total_ranked_players, is_calculating, is_outdated } = profile.summary.global;
    const displayName = name || t('unknownUser');
    const pathname = usePathname();

    const handleShareProfile = async () => {
        const path = pathname.replace(/\/players\/[^/]+/, `/players/${steamid}`);
        const url = `${window.location.origin}${path}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t('shareLinkCopied'));
        } catch {
            toast.error(t('shareLinkCopyFailed'));
        }
    };

    return (
        <Card className="w-full border-border/40 bg-card/50 backdrop-blur-xl">
            <CardContent className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="relative shrink-0">
                        <UserAvatar
                            userId={steamid}
                            pfpPromise={pfpPromise}
                            name={displayName}
                            width={120}
                            height={120}
                        />
                    </div>

                    <div className="flex flex-col flex-1 items-center sm:items-start text-center sm:text-left gap-3">
                        <div className="space-y-2">
                            <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                                    {displayName}
                                </h1>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-[50px] w-[50px] rounded-full"
                                                asChild
                                            >
                                                <a
                                                    href={`https://steamcommunity.com/profiles/${steamid}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    <SiSteam />
                                                </a>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{t('viewSteamProfile')}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>

                            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                                <Badge variant="secondary" className="text-xs font-mono">
                                    ID: {steamid}
                                </Badge>
                                <div className="flex items-center gap-1.5">
                                    <span className={`h-2 w-2 rounded-full ${profile.summary.is_online ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                                    <span className="text-xs text-muted-foreground">
                                        {profile.summary.is_online ? t('online') : t('offline')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center sm:items-end gap-3 sm:self-start sm:ml-auto">
                        <div className="text-center sm:text-right">
                            <div className="flex items-center justify-center sm:justify-end gap-1.5">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {t('globalRank')}
                                </span>
                                {is_calculating && (
                                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" aria-label={t('recalculating')} />
                                )}
                                {is_outdated && !is_calculating && (
                                    <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" aria-label={t('outOfDate')} />
                                )}
                            </div>
                            {rank != null ? (
                                <>
                                    <p className={`text-3xl font-bold ${is_outdated
                                        ? "text-muted-foreground"
                                        : "bg-gradient-to-br from-fuchsia-600 to-pink-600 bg-clip-text text-transparent"}`}>
                                        #{rank.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {t('ofTotalPlayers', { total: total_ranked_players.toLocaleString() })}
                                    </p>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground mt-1">{t('notEnoughPlaytime')}</p>
                            )}
                        </div>
                        {profile.is_owner && (
                            <Button variant="default" size="sm" onClick={handleShareProfile}>
                                <Share2 className="h-4 w-4 mr-1.5" />
                                {t('shareProfile')}
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
