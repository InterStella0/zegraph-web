'use client'
import {ReactNode, useState} from "react";
import {useTranslations} from "next-intl";
import {Circle, Gamepad2} from "lucide-react";
import dayjs from "lib/dayjs";
import {SearchField} from "components/ui/SearchField";
import {SkeletonText, Skeleton, varyWidth} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import InfoTooltip from "components/common/InfoTooltip";
import {PlayerAvatar} from "./PlayerAvatar.tsx";
import {PlayerName} from "./PlayerName";
import {IconCard} from "./IconCard";

/** `wrapDays` keeps the server list's display of hours within the current day. */
export function sessionDuration(startedAt: string, wrapDays = false): string {
    const elapsed = dayjs.duration(dayjs().diff(startedAt, "second"), "seconds");
    const hours = wrapDays ? elapsed.hours() : Math.floor(elapsed.asHours());
    return hours > 0 ? `${hours}h ${elapsed.minutes()}m` : `${elapsed.minutes()}m`;
}

export function OnlinePlayersSkeleton() {
    return (
        <div className="p-2 space-y-1">
            {Array.from({ length: 20 }, (_, index) => (
                <div key={index} className="py-1 flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                        <Skeleton className="w-[40px] h-[40px] rounded-[8%]" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                            <SkeletonText className="h-3.5" style={varyWidth(index)} />
                        </div>
                        <div className="text-xs">
                            <SkeletonText className="h-3 w-24" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Searchable, paginated card of online players; `namespace` picks the translations of the server or global list. */
export function OnlinePlayersPanel<T>({ namespace, className, items, loading, error, perPage, matches, renderRow, showNoneOnline, compact }: {
    namespace: 'players.online' | 'players.globalOnline',
    className: string,
    items: T[],
    loading?: boolean,
    error?: string,
    perPage: number,
    matches: (item: T, query: string) => boolean,
    renderRow: (item: T) => ReactNode,
    showNoneOnline?: boolean,
    compact?: boolean,
}) {
    const t = useTranslations(namespace);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const needle = query.trim().toLowerCase();
    const filtered = needle ? items.filter(item => matches(item, needle)) : items;
    const totalPages = Math.ceil(filtered.length / perPage);

    return (
        <IconCard
            icon={Gamepad2}
            className={className}
            title={t('title', {count: items.length})}
            action={<InfoTooltip text={t('offlineDelayInfo')} />}
        >
            <SearchField
                className="mb-4"
                placeholder={t('searchPlayers')}
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(0); }}
            />
            {loading ? (
                <OnlinePlayersSkeleton />
            ) : error ? (
                <div className="p-4 text-center">
                    <p className="text-destructive">{t('loadError', {error})}</p>
                </div>
            ) : filtered.length === 0 && (needle || showNoneOnline) ? (
                <div className="p-6 text-center">
                    <p className="text-muted-foreground">
                        {needle ? t('noPlayerName', {query}) : t('noneOnline')}
                    </p>
                </div>
            ) : (
                <>
                    <div className="p-2 space-y-1">
                        {filtered.slice(page * perPage, (page + 1) * perPage).map(renderRow)}
                    </div>
                    {totalPages > 1 && (
                        <div className="flex justify-center pt-4">
                            <PaginationPage page={page} setPage={setPage} totalPages={totalPages} compact={compact} />
                        </div>
                    )}
                </>
            )}
        </IconCard>
    );
}

type OnlinePlayer = { id: string, name: string, is_anonymous?: boolean, hidden_from_others?: boolean };

export function OnlinePlayerRow({ player, href, playingFor, children }: {
    player: OnlinePlayer, href: string | null, playingFor: string, children?: ReactNode,
}) {
    const name = <PlayerName
        name={player.name}
        isAnonymous={player.is_anonymous}
        hiddenFromOthers={player.hidden_from_others}
        className={href ? undefined : "text-sm font-medium truncate block"}
    />;
    return (
        <div className="py-1 rounded-md transition-all duration-200 flex items-center gap-3">
            <div className="relative flex-shrink-0">
                <PlayerAvatar uuid={player.id} name={player.name}/>
                <Circle
                    className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
                    style={{color: 'hsl(var(--success))'}}
                    fill="currentColor"
                />
            </div>
            <div className="flex-1 min-w-0">
                {href ? (
                    <HoverPrefetchLink href={href} className="text-sm font-medium hover:underline block truncate">
                        {name}
                    </HoverPrefetchLink>
                ) : name}
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {playingFor}
                </p>
            </div>
            {children}
        </div>
    );
}
