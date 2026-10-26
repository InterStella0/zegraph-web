'use client';

import { use, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Ban } from "lucide-react";
import { Badge } from "components/ui/badge";
import { Skeleton } from "components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/ui/table";
import { InfractionModal, openInfraction, withInfractionFlags } from "components/players/PlayerInfractionRecord";
import { cn } from "components/lib/utils";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import { formatFlagName, formatNumber, InfractionFlags, InfractionInt } from "utils/generalUtils";
import { GlobalPlayerInfraction } from "types/players";
import { ProfileResponse } from "types/community";
import { useServerMap } from "components/ui/ServerProvider";
import { communityTag, useProfileCommunities } from "./ProfileContext";
import { ENTER, SWAP } from "./profileMotion";
import { ISLAND, PageFooter, ProfileCard, ProfileCardHeader, ProfileCardLoading, usePaged } from "./ProfileCard";
import { tint } from "./profileChart";

type Infraction = Omit<GlobalPlayerInfraction, 'flags'> & { flags: InfractionInt, restrictions: string[] };

export function ProfileInfractionsLoading() {
    const t = useTranslations('players.infractions');
    return (
        <ProfileCardLoading title={t('title')}>
            <Skeleton className="h-[320px] w-full" />
        </ProfileCardLoading>
    );
}

export default function ProfileInfractions({ profilePromise, infractionsPromise }: {
    profilePromise: Promise<ProfileResponse>,
    infractionsPromise: Promise<GlobalPlayerInfraction[] | null>,
}) {
    const t = useTranslations('players.infractions');
    const tProfile = useTranslations('players.profile');
    const locale = useLocale();
    const toDayjs = useLocalDayjs();
    const raw = use(infractionsPromise);
    const playerId = use(profilePromise).steamid;
    const { communityOf, colorOf } = useProfileCommunities();
    const allCommunities = useServerMap()?.communities;
    const [type, setType] = useState<string | null>(null);
    const [viewInfraction, setViewInfraction] = useState<Infraction | null>(null);

    const infractions = useMemo<Infraction[]>(() => withInfractionFlags((raw ?? []).map(row => ({ ...row })))
        .map((row: Omit<Infraction, 'restrictions'>) => ({ ...row, restrictions: row.flags.getAllRestrictedFlags() })), [raw]);

    const typeCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const row of infractions)
            for (const name of row.restrictions)
                counts.set(name, (counts.get(name) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [infractions]);

    const filtered = useMemo(() => type
        ? infractions.filter(row => row.restrictions.includes(type))
        : infractions, [infractions, type]);
    const paged = usePaged(filtered, [type]);

    const describe = (communityId: string) => {
        const known = communityOf(communityId);
        if (known) return { name: known.name, tag: known.tag };
        const other = allCommunities?.find(community => community.id === communityId);
        return other
            ? { name: other.name, tag: communityTag(other.name, other.shorten_name) }
            : { name: undefined, tag: '?' };
    };

    return (
        <ProfileCard className={`${ENTER} delay-300`}>
            <InfractionModal infraction={viewInfraction} onClose={() => setViewInfraction(null)} />
            <ProfileCardHeader
                title={t('title')}
                badge={infractions.length > 0 && tProfile('total', { count: formatNumber(infractions.length, 0, locale) })}
            />

            {infractions.length === 0 ? (
                <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Ban className="h-8 w-8 opacity-50" />
                    <h3 className="text-lg font-semibold">{t('noRecords')}</h3>
                </div>
            ) : (
                <div className="space-y-3">
                    {typeCounts.length > 0 && (
                        <div className="flex flex-wrap gap-2" role="group" aria-label={tProfile('infractions.filter')}>
                            {typeCounts.map(([name, count]) => (
                                <button
                                    key={name}
                                    type="button"
                                    aria-pressed={type === name}
                                    onClick={() => setType(type === name ? null : name)}
                                    className={cn(
                                        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-all active:scale-95",
                                        type === name
                                            ? "border-destructive bg-destructive/15 text-foreground"
                                            : "border-border/60 hover:bg-muted",
                                    )}
                                >
                                    {formatFlagName(name)}
                                    <span className="tabular-nums text-muted-foreground">{formatNumber(count, 0, locale)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className={`rounded-md border border-border/60 ${ISLAND}`}>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16">{tProfile('infractions.community')}</TableHead>
                                    <TableHead>{tProfile('infractions.reason')}</TableHead>
                                    <TableHead className="hidden md:table-cell">{tProfile('infractions.admin')}</TableHead>
                                    <TableHead className="text-right">{tProfile('infractions.date')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody key={`${type}-${paged.page}`} className={SWAP}>
                                {paged.pageRows.map(row => {
                                    const community = describe(row.community_id);
                                    const accent = colorOf(row.community_id);
                                    const by = row.flags.hasFlag(InfractionFlags.SYSTEM) ? t('system') : row.by;
                                    return (
                                        <TableRow
                                            key={`${row.source}-${row.id}`}
                                            className="cursor-pointer"
                                            onClick={() => openInfraction(row, playerId, viewed => setViewInfraction(viewed))}
                                        >
                                            <TableCell>
                                                <span
                                                    className="inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-[11px] font-bold"
                                                    style={{ backgroundColor: tint(accent, 0.18), color: accent }}
                                                    title={community.name}
                                                >
                                                    {community.tag}
                                                </span>
                                            </TableCell>
                                            <TableCell className="whitespace-normal">
                                                <p className={cn("text-sm", !row.reason && "italic text-muted-foreground")}>
                                                    {row.reason || t('noReason')}
                                                </p>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {row.restrictions.length > 0 ? row.restrictions.map(name => (
                                                        <Badge key={name} variant="destructive" className="h-5 px-1.5 text-[11px]">
                                                            {formatFlagName(name)}
                                                        </Badge>
                                                    )) : (
                                                        <span className="text-xs italic text-muted-foreground">{t('noRestrictions')}</span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-xs text-muted-foreground md:hidden">{by}</p>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">{by}</TableCell>
                                            <TableCell className="whitespace-nowrap text-right text-muted-foreground" suppressHydrationWarning>
                                                {row.infraction_time ? toDayjs(row.infraction_time).format('ll') : '—'}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    <PageFooter paged={paged} />
                </div>
            )}
        </ProfileCard>
    );
}
