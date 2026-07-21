'use client'
import {useTranslations} from 'next-intl';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight, Star } from 'lucide-react';
import { Card } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useMapContext } from '../../app/servers/[server_slug]/maps/[map_name]/MapContext';
import { useServerData } from '../../app/servers/[server_slug]/ServerDataProvider';
import ErrorCatch from '../ui/ErrorMessage';
import { fetchApiServerUrl } from 'utils/generalUtils';
import {Guide} from "types/guides.ts";

function MapGuidesButtonDisplay() {
    const t = useTranslations('maps');
    const { name } = useMapContext();
    const { server } = useServerData();
    const router = useRouter();
    const [guideCount, setGuideCount] = useState<number | null>(null);
    const [guideHighlight, setGuideHighlight] = useState<Guide | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const abortController = new AbortController();

        setLoading(true);
        fetchApiServerUrl(server.id, `/maps/${name}/guides`, {
            params: { page: 0, sort: 'TopRated' },
            signal: abortController.signal
        })
            .then(data => {
                setGuideCount(data.total_guides);
                setGuideHighlight(data.guides[0]);
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    setError(err.message);
                }
            })
            .finally(() => setLoading(false));

        return () => abortController.abort();
    }, [server.id, name]);

    const handleClick = () => {
        router.push(`/servers/${server.gotoLink}/maps/${name}/guides`);
    };

    return (
        <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={handleClick}
        >
            {/* Mobile Layout */}
            <div className="sm:hidden w-full flex flex-row justify-between items-center">
                <div className="flex items-center gap-1.5">
                    <div className="text-blue-400">
                        <BookOpen className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="text-xs font-medium">
                            {t('communityGuides')}
                        </div>
                        {loading ? (
                            <Skeleton className="w-[40px] h-[20px] mt-1" />
                        ) : error ? (
                            <div className="text-xs text-destructive">{t('error')}</div>
                        ) : (
                            <div className="text-lg font-bold leading-tight text-blue-400">
                                {guideCount || 0}
                            </div>
                        )}
                    </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Desktop Layout */}
            <div className="hidden sm:flex w-full h-full flex-col">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex gap-2 items-center">
                        <div className="text-blue-400">
                            <BookOpen className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-medium">
                            {t('communityGuides')}
                        </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>

                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="w-24 h-5" />
                        <Skeleton className="w-3/4 h-4" />
                        <Skeleton className="w-32 h-4" />
                    </div>
                ) : error ? (
                    <p className="text-sm text-destructive">{t('failedToLoad')}</p>
                ) : guideCount === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('noGuidesYet')}</p>
                ) : (
                    <div className="space-y-2.5">
                        {/* Guide count */}
                        <p className="text-sm text-muted-foreground">
                            {guideCount} {guideCount === 1 ? 'guide' : 'guides'} available
                        </p>

                        {/* Divider */}
                        <div className="border-t border-border/50" />

                        {/* Top rated guide */}
                        {guideHighlight && (
                            <div className="space-y-1.5">
                                <div className="flex items-start gap-1.5">
                                    <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 mt-0.5 shrink-0" />
                                    <p className="text-sm font-medium line-clamp-2 leading-snug">
                                        {guideHighlight.title}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 ml-5">
                                    <Avatar className="h-5 w-5">
                                        <AvatarImage
                                            src={guideHighlight.author.avatar || undefined}
                                            alt={guideHighlight.author.name}
                                        />
                                        <AvatarFallback className="text-[10px]">
                                            {guideHighlight.author.name.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {guideHighlight.author.name}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}

export default function MapGuidesButton() {
    const t = useTranslations('maps');
    return (
        <ErrorCatch message={t('guidesButtonError')}>
            <MapGuidesButtonDisplay />
        </ErrorCatch>
    );
}
