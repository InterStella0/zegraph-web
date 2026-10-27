'use client';

import { createContext, ReactNode, use, useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { ProfileCommunityDetail, ProfileResponse } from "types/community";
import { useCommunityColors } from "lib/hooks/useCommunityColors";
import { getServerAvatarText } from "components/ui/CommunitySelector";
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar";
import { Badge } from "components/ui/badge";
import { cn } from "components/lib/utils";
import { tint } from "./profileChart";

const UNKNOWN_COLOR = "grey";

export type ProfileCommunity = {
    id: string,
    name: string,
    tag: string,
    iconUrl: string | null,
    color: string,
    playtime: number,
    detail: ProfileCommunityDetail,
}

type CommunityId = string | null | undefined;

type ProfileCommunitiesValue = {
    communities: ProfileCommunity[],
    communityOf: (id: CommunityId) => ProfileCommunity | undefined,
    /** The community's name, falling back to the raw id for communities the player has no profile in. */
    nameOf: (id: string) => string,
    colorOf: (id: CommunityId) => string,
    focused: string | null,
    setFocused: (id: string | null) => void,
}

const ProfileCommunitiesContext = createContext<ProfileCommunitiesValue>({
    communities: [],
    communityOf: () => undefined,
    nameOf: id => id,
    colorOf: () => UNKNOWN_COLOR,
    focused: null,
    setFocused: () => {},
});

const NOT_ALPHANUMERIC = /[^\p{L}\p{N}]/gu;

export function communityTag(name: string, shortName?: string | null): string {
    const short = shortName?.replace(NOT_ALPHANUMERIC, '') ?? '';
    if (short.length >= 2 && short.length <= 3) return short.toUpperCase();
    const words = name.split(/\s+/).map(word => word.replace(NOT_ALPHANUMERIC, '')).filter(Boolean).join(' ');
    return words ? getServerAvatarText(words).toUpperCase() : "?";
}

export function ProfileCommunitiesProvider({ profilePromise, children }: {
    profilePromise: Promise<ProfileResponse>,
    children: ReactNode,
}) {
    const profile = use(profilePromise);
    const [focused, setFocused] = useState<string | null>(null);
    const details = useMemo(() => profile.communities ?? [], [profile]);

    const colors = useCommunityColors(details.map(community => ({
        key: community.id,
        name: community.name,
        icon_url: community.icon_url,
    })));

    const communities = useMemo<ProfileCommunity[]>(() => details
        .map(detail => ({
            id: detail.id,
            name: detail.name,
            tag: communityTag(detail.name, detail.shorten_name),
            iconUrl: detail.icon_url ?? null,
            color: colors[detail.id] ?? UNKNOWN_COLOR,
            playtime: detail.servers.reduce((sum, server) => sum + server.player.total_playtime, 0),
            detail,
        }))
        .sort((a, b) => b.playtime - a.playtime), [details, colors]);

    const communityOf = useCallback((id: CommunityId) =>
        id ? communities.find(community => community.id === id) : undefined, [communities]);
    const nameOf = useCallback((id: string) => communityOf(id)?.name ?? id, [communityOf]);
    const colorOf = useCallback((id: CommunityId) => communityOf(id)?.color ?? UNKNOWN_COLOR, [communityOf]);

    const value = useMemo(() => ({
        communities, communityOf, nameOf, colorOf, focused, setFocused,
    }), [communities, communityOf, nameOf, colorOf, focused]);

    return <ProfileCommunitiesContext.Provider value={value}>{children}</ProfileCommunitiesContext.Provider>;
}

export function useProfileCommunities(): ProfileCommunitiesValue {
    return useContext(ProfileCommunitiesContext);
}

export function useFocusFilter(): (communityId: CommunityId) => boolean {
    const { focused } = useProfileCommunities();
    return useCallback((communityId) => !focused || communityId === focused, [focused]);
}

/** A community's logo, or its tag in its colour where it has none. */
export function CommunityLogo({ name, tag, iconUrl, color, className }: {
    name?: string,
    tag: string,
    iconUrl?: string | null,
    color: string,
    className?: string,
}) {
    return (
        <Avatar className={cn("shrink-0", className)} title={name}>
            {iconUrl && <AvatarImage src={iconUrl} alt={name} />}
            <AvatarFallback className="text-xs font-bold" style={{ backgroundColor: tint(color, 0.18), color }}>
                {tag}
            </AvatarFallback>
        </Avatar>
    );
}

export function FocusChip() {
    const t = useTranslations('players.profile.focus');
    const { focused, setFocused, communityOf } = useProfileCommunities();
    const community = communityOf(focused);
    if (!community) return null;
    return (
        <Badge variant="outline" className="h-6 gap-1.5 pr-1 text-xs motion-safe:animate-in fade-in-0 zoom-in-95 animation-duration-200">
            <span className="size-2 rounded-full" style={{ backgroundColor: community.color }} aria-hidden />
            {t('focused', { community: community.tag })}
            <button
                type="button"
                onClick={() => setFocused(null)}
                className="rounded-sm p-0.5 hover:bg-muted"
                aria-label={t('clear')}
            >
                <X className="size-3" />
            </button>
        </Badge>
    );
}
