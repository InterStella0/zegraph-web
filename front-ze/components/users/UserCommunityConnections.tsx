'use client';

import { ProfileResponse, UserAnonymization } from "types/community";
import CommunityConnectionCard, { CONNECTION_COLUMNS } from "./CommunityConnectionCard";
import { useState, useCallback, useOptimistic, startTransition, use } from "react";
import { useTranslations } from "next-intl";
import { fetchApiUrl } from "utils/generalUtils";
import { Badge } from "components/ui/badge";
import { Card, CardContent } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import { useProfileCommunities } from "./ProfileContext";
import { ENTER } from "./profileMotion";

const CARD = "border-border/40 bg-card/50 backdrop-blur-xl";

interface UserCommunityConnectionsProps {
    profilePromise: Promise<ProfileResponse>;
}

export function UserCommunityConnectionsLoading() {
    const t = useTranslations('players.profile.communities');
    return (
        <Card className={CARD}>
            <CardContent className="p-4 sm:p-6">
                <h2 className="mb-4 text-xl font-semibold">{t('heading')}</h2>
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
            </CardContent>
        </Card>
    );
}

export default function UserCommunityConnections({
    profilePromise
}: UserCommunityConnectionsProps)  {
    const t = useTranslations('players.profile.communities');
    const tHeader = useTranslations('players.profile.header');
    const profile = use(profilePromise);
    const { communities: ordered } = useProfileCommunities();
    const { communities, can_manage_anonymization: canManageAnonymization, anonymization } = profile;
    const targetUserId = profile.is_owner ? undefined : profile.steamid;

    const initialSettings = new Map<string, UserAnonymization>();
    (anonymization ?? []).forEach(setting => {
        if (setting.community_id) initialSettings.set(setting.community_id, setting);
    });

    const [anonymizedCommunities, setAnonymizedCommunities] = useState<Map<string, UserAnonymization>>(initialSettings);
    const [anonymizedOptimisticCommunities, addOptimisticAnonymizedCommunities] = useOptimistic<Map<string, UserAnonymization>, UserAnonymization>(
        anonymizedCommunities,
        (currentState, optimisticValue) => {
            const newState = new Map(currentState);
            newState.set(optimisticValue.community_id!, optimisticValue)
            return newState;
        }
    );

    const handleToggleAnonymize = useCallback(async (communityId: string | number, type: "location" | "anonymous", value: boolean, settings: UserAnonymization | null) => {
        try {
            let body: {community_id: string, anonymize?: boolean, hide_location?: boolean, user_id?: string} = {
                community_id: communityId.toString(),
                ...(targetUserId ? {user_id: targetUserId} : {}),
            }
            if (type === "location"){
                body["hide_location"] = value
                body["anonymize"] = settings?.anonymized ?? false
            }
            if (type === "anonymous"){
                body['anonymize'] = value
                if (value)
                    body["hide_location"] = value
                else
                    body["hide_location"] = settings?.hide_location ?? false
            }
            startTransition(() => {
                addOptimisticAnonymizedCommunities({
                    user_id: 0,
                    community_id: communityId.toString(),
                    anonymized: body.anonymize!,
                    hide_location: body.hide_location!
                })
            })
            const data: UserAnonymization = await fetchApiUrl('/users/anonymize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body)
            });
            startTransition(() => {
                setAnonymizedCommunities(prev => {
                    const newMap = new Map(prev);
                    newMap.set(data.community_id!, data)
                    return newMap;
                });
            })
        } catch (error) {
            console.error('Failed to update anonymization setting:', error);
        }
    }, [addOptimisticAnonymizedCommunities, targetUserId]);

    const scaleMax = Math.max(
        7200,
        ...(communities ?? []).flatMap(c => c.servers.flatMap(s => s.recent_sessions.map(r => r.duration)))
    );
    const totalPlaytime = ordered.reduce((sum, community) => sum + community.playtime, 0);
    const serverCount = ordered.reduce((sum, community) => sum + community.detail.servers.length, 0);

    return (
        <Card className={`${CARD} ${ENTER} delay-200`}>
            <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">{t('heading')}</h2>
                        {ordered.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                                {tHeader('communitiesServers', { communities: ordered.length, servers: serverCount })}
                            </Badge>
                        )}
                    </div>
                    {ordered.length > 0 && <span className="text-sm text-muted-foreground">{t('expandHint')}</span>}
                </div>

                {ordered.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground">{t('empty')}</p>
                ) : (
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
                                settings={anonymizedOptimisticCommunities.get(community.id) ?? null}
                                onToggleAnonymize={handleToggleAnonymize}
                                showAnonymizeToggle={canManageAnonymization}
                                scaleMax={scaleMax}
                                defaultOpen={index === 0}
                                index={index}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
