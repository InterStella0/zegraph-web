'use client'
import {use, useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Users} from 'lucide-react';
import {fetchApiUrl, simpleRandom} from "utils/generalUtils";
import {GlobalBriefPlayers} from "types/players";
import {Card, CardContent, CardHeader} from "components/ui/card";
import {Skeleton} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import GlobalPlayerRow from "./GlobalPlayerRow.tsx";
import {useDebounced} from "lib/hooks/useDebounced";
import {useResource} from "lib/hooks/useResource";
import {SearchField} from "./OnlinePlayers";
import {withErrorCatch} from "components/common/withErrorCatch";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;
const MIN_SEARCH_LENGTH = 3;

function GlobalPlayerListSkeleton({ count = PAGE_SIZE }: { count?: number }) {
    const [isClient, setIsClient] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])
    return (
        <div className="space-y-2">
            {Array.from({length: count}).map((_, index) => (
                <div
                    key={index}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
                >
                    <div className="flex items-center gap-3 sm:w-56">
                        <Skeleton className="w-10 h-10 rounded-[22%] flex-shrink-0"/>
                        <div>
                            <Skeleton className="h-5 mb-1" style={{width: isClient ? `${simpleRandom(5, 10)}rem` : '5rem'}}/>
                            <Skeleton className="h-3.5 w-24"/>
                        </div>
                    </div>
                    <div className="flex-1 min-w-40 max-sm:order-last max-sm:w-full">
                        <Skeleton className="h-2 w-full rounded-full"/>
                        <Skeleton className="h-3 w-32 mt-1.5"/>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-auto">
                        <Skeleton className="h-7 w-20"/>
                        <Skeleton className="h-5 w-16"/>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function GlobalPlayerListLoading() {
    const t = useTranslations('players.global');
    return (
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary"/>
                    <div>
                        <h1 className="text-lg max-sm:text-md font-semibold">{t('title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
                    </div>
                </div>
                <div className="text-right">
                    <Skeleton className="h-7 w-16 ml-auto"/>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('totalPlayers')}</p>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <SearchField placeholder={t('searchPlaceholder')} disabled/>
                <GlobalPlayerListSkeleton/>
            </CardContent>
        </Card>
    );
}

function GlobalPlayerListDisplay({ initialDataPromise }: {
    initialDataPromise: Promise<GlobalBriefPlayers>,
}) {
    const t = useTranslations('players.global');
    const initialData = use(initialDataPromise);
    const [searchInput, setSearchInput] = useState<string>('');
    const [page, setPage] = useState<number>(0);

    const debouncedInput = useDebounced(searchInput.trim(), SEARCH_DEBOUNCE_MS);
    const debouncedSearch = debouncedInput.length >= MIN_SEARCH_LENGTH ? debouncedInput : '';

    useEffect(() => {
        setPage(0);
    }, [debouncedSearch]);

    const { data, loading, error: fetchError } = useResource<GlobalBriefPlayers>(signal => fetchApiUrl('/communities/all/players', {
        params: { page, ...(debouncedSearch && {search: debouncedSearch}) },
        signal,
    }), [page, debouncedSearch], { initial: initialData, keepData: true, errorLog: 'Error fetching global players:' });
    const error = fetchError?.message;
    const totalPages = Math.max(1, Math.ceil((data?.total_players || 0) / PAGE_SIZE));

    return (
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary"/>
                    <div>
                        <h1 className="text-lg max-sm:text-md font-semibold">{t('title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
                    </div>
                </div>
                <div className="text-right">
                    {data ? (
                        <p className="text-xl font-bold tabular-nums">{data.total_players.toLocaleString()}</p>
                    ) : (
                        <Skeleton className="h-7 w-16 ml-auto"/>
                    )}
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('totalPlayers')}</p>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <SearchField placeholder={t('searchPlaceholder')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)}/>

                {loading ? (
                    <GlobalPlayerListSkeleton/>
                ) : error ? (
                    <div className="p-8 text-center">
                        <p className="text-destructive">{t('loadError')}</p>
                    </div>
                ) : data?.players?.length ? (
                    <div className="space-y-2">
                        {data.players.map(player => (
                            <GlobalPlayerRow key={player.id} player={player}/>
                        ))}
                    </div>
                ) : (
                    <div className="p-8 text-center">
                        <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                            {t('noPlayersFound')}
                        </h3>
                        {debouncedSearch && (
                            <p className="text-sm text-muted-foreground">
                                {t('noResultsFor', {query: debouncedSearch})}
                            </p>
                        )}
                    </div>
                )}

                <div className="flex justify-center mt-4">
                    <PaginationPage totalPages={totalPages} page={page} setPage={setPage}/>
                </div>
            </CardContent>
        </Card>
    );
}

export default withErrorCatch(GlobalPlayerListDisplay, t => t('players.global.loadError'))
