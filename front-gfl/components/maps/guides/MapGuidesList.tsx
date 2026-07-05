'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, AlertTriangle, BookOpen } from 'lucide-react';
import { Guide, GuideSortType } from 'types/guides';
import { Card } from 'components/ui/card';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import GuideCard from './GuideCard';
import CategoryFilter from './CategoryFilter';
import SortFilter from './SortFilter';
import PaginationPage from '../../ui/PaginationPage';
import ErrorCatch from '../../ui/ErrorMessage';
import LoginDialog from '../../ui/LoginDialog';
import { fetchApiUrl} from 'utils/generalUtils';
import {SteamSession} from "../../../auth.ts";
import {useGuideContext} from "../../../lib/GuideContextProvider.tsx";
import {resolveGuideLink} from "../../../app/maps/[map_name]/guides/util.ts";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from 'components/ui/tooltip';
import {CommunitiesData, getCommunityData} from "../../../app/getCommunity.ts";
import { useTranslations } from 'next-intl';

interface MapGuidesListDisplayProps {
    session: SteamSession | null;
}

function MapGuidesListDisplay({ session }: MapGuidesListDisplayProps) {
    const t = useTranslations('guides.list');
    const { mapName, serverGoto, serverId } = useGuideContext();
    const router = useRouter();
    const isBanned = session?.isBanned ?? false;
    const banReason = session?.banReason ?? null;

    const [guides, setGuides] = useState<Guide[]>([]);
    const [totalGuides, setTotalGuides] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [sortBy, setSortBy] = useState<GuideSortType>('TopRated');
    const [loginDialogOpen, setLoginDialogOpen] = useState(false);
    const [ communities, setCommunities ] = useState<CommunitiesData>(null)


    useEffect(() => {
        getCommunityData().then(setCommunities)
    }, []);
    // Fetch guides whenever filters change
    useEffect(() => {
        const abortController = new AbortController();

        setLoading(true);
        setError(null);

        const params = {
            page: page.toString(),
            sort: sortBy
        };
        if (selectedCategory != "all"){
            params["category"] = selectedCategory
        }

        fetchApiUrl(resolveGuideLink(serverId, `/${mapName}/guides`), {
            params,
            signal: abortController.signal
        })
            .then(data => {
                setGuides(data.guides);
                setTotalGuides(data.total_guides);
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    setError(err.message || 'Failed to load guides');
                }
            })
            .finally(() => setLoading(false));

        return () => abortController.abort();
    }, [serverId, mapName, page, selectedCategory, sortBy]);

    // Reset page when filters change
    useEffect(() => {
        setPage(0);
    }, [selectedCategory, sortBy]);

    const handleCreateGuide = () => {
        if (!session) {
            setLoginDialogOpen(true);
            return;
        }
        router.push(resolveGuideLink(serverGoto, `/${mapName}/guides/new`))
    };

    const totalPages = Math.ceil(totalGuides / 10);

    return (
        <div>
            {/* Filters and Create Button */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <CategoryFilter value={selectedCategory} onChange={setSelectedCategory} />
                    <SortFilter value={sortBy} onChange={setSortBy} />
                </div>
                {isBanned ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="w-full sm:w-auto">
                                    <Button disabled className="w-full sm:w-auto">
                                        <Plus className="mr-2 h-4 w-4" />
                                        {t('createGuide')}
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="font-semibold">{t('youAreBanned')}</p>
                                {banReason && <p className="text-sm text-muted-foreground">{banReason}</p>}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <Button onClick={handleCreateGuide} className="w-full sm:w-auto">
                        <Plus className="mr-2 h-4 w-4" />
                        {t('createGuide')}
                    </Button>
                )}
            </div>

            {/* Loading State */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-6 w-20 ml-auto" />
                            </div>
                            <Skeleton className="h-6 w-full mb-2" />
                            <Skeleton className="h-4 w-full mb-1" />
                            <Skeleton className="h-4 w-full mb-1" />
                            <Skeleton className="h-4 w-3/4 mb-3" />
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Error State */}
            {!loading && error && (
                <Card className="p-6">
                    <div className="flex items-center gap-3 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        <p>{error}</p>
                    </div>
                </Card>
            )}

            {/* Empty State */}
            {!loading && !error && guides.length === 0 && (
                <Card className="p-12">
                    <div className="text-center">
                        <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">{t('noGuides')}</h3>
                        <p className="text-muted-foreground mb-4">
                            {t('beFirst')}
                        </p>
                        {isBanned ? (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span>
                                            <Button disabled>
                                                <Plus className="mr-2 h-4 w-4" />
                                                {t('createFirstGuide')}
                                            </Button>
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="font-semibold">{t('youAreBanned')}</p>
                                        {banReason && <p className="text-sm text-muted-foreground">{banReason}</p>}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            <Button onClick={handleCreateGuide}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t('createFirstGuide')}
                            </Button>
                        )}
                    </div>
                </Card>
            )}

            {/* Guides Grid */}
            {!loading && !error && guides.length > 0 && (
                <>
                    {/* Top Pagination */}
                    {totalPages > 1 && (
                        <div className="mb-4">
                            <PaginationPage
                                page={page}
                                setPage={setPage}
                                totalPages={totalPages}
                                compact
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {guides.map((guide) => (
                            <GuideCard key={guide.id} guide={guide} communities={communities} />
                        ))}
                    </div>

                    {/* Bottom Pagination */}
                    {totalPages > 1 && (
                        <PaginationPage
                            page={page}
                            setPage={setPage}
                            totalPages={totalPages}
                        />
                    )}
                </>
            )}

            {/* Login Dialog */}
            <LoginDialog
                open={loginDialogOpen}
                onClose={() => setLoginDialogOpen(false)}
            />
        </div>
    );
}

interface MapGuidesListProps {
    session: SteamSession | null;
}

export default function MapGuidesList({ session }: MapGuidesListProps) {
    const t = useTranslations('guides.list');
    return (
        <ErrorCatch message={t('loadError')}>
            <MapGuidesListDisplay session={session} />
        </ErrorCatch>
    );
}
