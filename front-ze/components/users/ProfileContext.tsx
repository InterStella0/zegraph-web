'use client';

import { createContext, ReactNode, use, useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { ProfileCommunityDetail, ProfileResponse } from "types/community";
import { useCommunityColors } from "lib/hooks/useCommunityColors";
import { getServerAvatarText } from "components/ui/CommunitySelector";
import { Badge } from "components/ui/badge";

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

type ProfileCommunitiesValue = {
    communities: ProfileCommunity[],
    communityOf: (id: string | null | undefined) => ProfileCommunity | undefined,
    colorOf: (id: string | null | undefined) => string,
    focused: string | null,
    setFocused: (id: string | null) => void,
}

const ProfileCommunitiesContext = createContext<ProfileCommunitiesValue>({
    communities: [],
    communityOf: () => undefined,
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

export function communityPlaytime(community: ProfileCommunityDetail): number {
    return community.servers.reduce((sum, server) => sum + server.player.total_playtime, 0);
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
            playtime: communityPlaytime(detail),
            detail,
        }))
        .sort((a, b) => b.playtime - a.playtime), [details, colors]);

    const communityOf = useCallback((id: string | null | undefined) =>
        id ? communities.find(community => community.id === id) : undefined, [communities]);
    const colorOf = useCallback((id: string | null | undefined) =>
        communityOf(id)?.color ?? UNKNOWN_COLOR, [communityOf]);

    const value = useMemo(() => ({
        communities, communityOf, colorOf, focused, setFocused,
    }), [communities, communityOf, colorOf, focused]);

    return <ProfileCommunitiesContext.Provider value={value}>{children}</ProfileCommunitiesContext.Provider>;
}

export function useProfileCommunities(): ProfileCommunitiesValue {
    return useContext(ProfileCommunitiesContext);
}

export function useFocusFilter(): (communityId: string | null | undefined) => boolean {
    const { focused } = useProfileCommunities();
    return useCallback((communityId) => !focused || communityId === focused, [focused]);
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
