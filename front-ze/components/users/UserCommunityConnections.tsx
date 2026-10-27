'use client';

import { ProfileResponse, UserAnonymization } from "types/community";
import CommunityConnectionCard, { AnonymizeType, CONNECTION_COLUMNS } from "./CommunityConnectionCard";
import { useState, useOptimistic, startTransition, use } from "react";
import { useTranslations } from "next-intl";
import { sendJson } from "lib/sendJson";
import { Skeleton } from "components/ui/skeleton";
import { range } from "utils/generalUtils";
import { useProfileCommunities } from "./ProfileContext";
import { ENTER } from "./profileMotion";
import { ProfileCard, ProfileCardHeader, ProfileCardLoading, SURFACE } from "./ProfileCard";

type Settings = Map<string, UserAnonymization>;

const withSetting = (settings: Settings, setting: UserAnonymization) => new Map(settings).set(setting.community_id!, setting);

export function UserCommunityConnectionsLoading() {
    const t = useTranslations('players.profile.communities');
    return (
        <ProfileCardLoading title={t('heading')}>
            <div className="space-y-2">
                {range(3).map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
        </ProfileCardLoading>
    );
}

export default function UserCommunityConnections({ profilePromise }: { profilePromise: Promise<ProfileResponse> }) {
    const t = useTranslations('players.profile.communities');
    const tHeader = useTranslations('players.profile.header');
    const profile = use(profilePromise);
    const { communities: ordered } = useProfileCommunities();
    const { communities, can_manage_anonymization: canManageAnonymization, anonymization } = profile;
    const targetUserId = profile.is_owner ? undefined : profile.steamid;

    const [settings, setSettings] = useState<Settings>(() => new Map((anonymization ?? [])
        .filter(setting => setting.community_id)
        .map(setting => [setting.community_id, setting])));
    const [optimisticSettings, addOptimisticSetting] = useOptimistic(settings, withSetting);

    const handleToggleAnonymize = async (communityId: string, type: AnonymizeType, value: boolean, current: UserAnonymization | null) => {
        try {
            const anonymize = type === "anonymous" ? value : current?.anonymized ?? false;
            // Anonymizing also hides the location; un-anonymizing leaves it as it was.
            const hideLocation = type === "location" || value ? value : current?.hide_location ?? false;
            startTransition(() => addOptimisticSetting({
                user_id: 0, community_id: communityId, anonymized: anonymize, hide_location: hideLocation,
            }));
            const data: UserAnonymization = await sendJson('/users/anonymize', 'POST', {
                community_id: communityId,
                ...(targetUserId ? { user_id: targetUserId } : {}),
                anonymize,
                hide_location: hideLocation,
            });
            startTransition(() => setSettings(prev => withSetting(prev, data)));
        } catch (error) {
            console.error('Failed to update anonymization setting:', error);
        }
    };

    const scaleMax = Math.max(
        7200,
        ...(communities ?? []).flatMap(c => c.servers.flatMap(s => s.recent_sessions.map(r => r.duration)))
    );
    const totalPlaytime = ordered.reduce((sum, community) => sum + community.playtime, 0);
    const serverCount = ordered.reduce((sum, community) => sum + community.detail.servers.length, 0);

    return (
        <ProfileCard className={`${ENTER} delay-200`}>
            <ProfileCardHeader
                title={t('heading')}
                className="gap-2"
                badge={ordered.length > 0 && tHeader('communitiesServers', { communities: ordered.length, servers: serverCount })}
                actions={ordered.length > 0 && <span className="text-sm text-muted-foreground">{t('expandHint')}</span>}
            />

            {ordered.length === 0 ? (
                <p className={`py-8 text-center text-muted-foreground ${SURFACE}`}>{t('empty')}</p>
            ) : (
                // The surface goes outside the table, which clips anything that spreads past it.
                <div className={SURFACE}>
                    <div className="overflow-hidden rounded-lg border border-border/60">
                        <div className={`${CONNECTION_COLUMNS} hidden border-b border-border/60 bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid`}>
                            <span />
                            <span>{t('community')}</span>
                            <span>{t('playtime')}</span>
                            <span className="text-right">{t('rank')}</span>
                            <span />
                        </div>
                        {ordered.map((community, index) => (
                            <CommunityConnectionCard
                                key={community.id}
                                community={community}
                                share={totalPlaytime > 0 ? community.playtime / totalPlaytime : 0}
                                settings={optimisticSettings.get(community.id) ?? null}
                                onToggleAnonymize={handleToggleAnonymize}
                                showAnonymizeToggle={canManageAnonymization}
                                scaleMax={scaleMax}
                                defaultOpen={index === 0}
                                index={index}
                            />
                        ))}
                    </div>
                </div>
            )}
        </ProfileCard>
    );
}
