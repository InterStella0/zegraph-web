'use client'

import { use, useState, useEffect, useMemo } from 'react';
import { Guide } from 'types/guides';
import { Card } from 'components/ui/card';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import { AlertTriangle, BookOpen, Plus, Filter, X } from 'lucide-react';
import PaginationPage from 'components/ui/PaginationPage';
import ServerGuideCard from './ServerGuideCard';
import ErrorCatch from 'components/ui/ErrorMessage';
import LoginDialog from 'components/ui/LoginDialog';
import MapSelectDialog from './MapSelectDialog';
import MapFilterDialog from './MapFilterDialog';
import { fetchApiServerUrl } from 'utils/generalUtils';
import { Server } from 'types/community';
import {SteamSession} from "../../auth.ts";

interface ServerGuidesListDisplayProps {
    serverPromise: Promise<Server>;
    sessionPromise: Promise<SteamSession>;
}

function ServerGuidesListDisplay({ serverPromise, sessionPromise }: ServerGuidesListDisplayProps) {
    const server = use(serverPromise);
    const session = use(sessionPromise);

    const [guides, setGuides] = useState<Guide[]>([]);
    const [totalGuides, setTotalGuides] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loginDialogOpen, setLoginDialogOpen] = useState(false);
    const [mapSelectDialogOpen, setMapSelectDialogOpen] = useState(false);
    const [filterDialogOpen, setFilterDialogOpen] = useState(false);
    const [selectedMap, setSelectedMap] = useState<string | null>(null);

    const filteredGuides = useMemo(() => {
        if (!selectedMap) return guides;
        return guides.filter(g => g.map_name === selectedMap);
    }, [guides, selectedMap]);

    const handleMapFilter = (mapName: string) => {
        setSelectedMap(mapName);
        setPage(0);
    };

    const clearMapFilter = () => {
        setSelectedMap(null);
        setPage(0);
    };

    const handleCreateGuide = () => {
        if (!session) {
            setLoginDialogOpen(true);
            return;
        }
        setMapSelectDialogOpen(true);
    };

    // Fetch guides
    useEffect(() => {
        const abortController = new AbortController();
        setLoading(true);
        setError(null);

        fetchApiServerUrl(server.id, `/guides`, {
            params: { page: page.toString() },
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
    }, [server.id, page]);

    const totalPages = Math.ceil(totalGuides / 10);

    return (
        <div className="container max-w-screen-xl mx-auto px-4">
            {/* Filter and Create Guide Buttons */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setFilterDialogOpen(true)}>
                        <Filter className="mr-2 h-4 w-4" />
                        Filter by Map
                    </Button>
                    {selectedMap && (
                        <div className="flex items-center gap-1 px-3 py-1.5 bg-secondary rounded-full text-sm">
                            <span className="font-medium">{selectedMap}</span>
                            <button
                                onClick={clearMapFilter}
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </div>
                <Button onClick={handleCreateGuide}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Guide
                </Button>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="p-6">
                            <Skeleton className="h-48 w-full mb-4 rounded-lg" />
                            <Skeleton className="h-6 w-3/4 mb-2" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-5/6 mb-4" />
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <Skeleton className="h-4 w-32" />
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
            {!loading && !error && filteredGuides.length === 0 && (
                <Card className="p-12">
                    <div className="text-center">
                        <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">
                            {selectedMap ? 'No guides for this map' : 'No guides yet'}
                        </h3>
                        <p className="text-muted-foreground">
                            {selectedMap
                                ? `No guides have been created for ${selectedMap} yet.`
                                : "No guides have been created for this server's maps yet."}
                        </p>
                        {selectedMap && (
                            <Button variant="link" onClick={clearMapFilter} className="mt-2">
                                Clear filter
                            </Button>
                        )}
                    </div>
                </Card>
            )}

            {/* Guides Grid */}
            {!loading && !error && filteredGuides.length > 0 && (
                <>
                    {totalPages > 1 && (
                        <div className="mb-6">
                            <PaginationPage
                                page={page}
                                setPage={setPage}
                                totalPages={totalPages}
                                compact
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                        {filteredGuides.map((guide) => (
                            <ServerGuideCard
                                key={guide.id}
                                guide={guide}
                                serverId={server.id}
                                serverGotoLink={server.gotoLink}
                            />
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <PaginationPage
                            page={page}
                            setPage={setPage}
                            totalPages={totalPages}
                        />
                    )}
                </>
            )}

            {/* Dialogs */}
            <LoginDialog
                open={loginDialogOpen}
                onClose={() => setLoginDialogOpen(false)}
            />
            <MapSelectDialog
                open={mapSelectDialogOpen}
                onClose={() => setMapSelectDialogOpen(false)}
                serverId={server.id}
                serverGotoLink={server.gotoLink}
            />
            <MapFilterDialog
                open={filterDialogOpen}
                onClose={() => setFilterDialogOpen(false)}
                onSelect={handleMapFilter}
                serverId={server.id}
            />
        </div>
    );
}

export default function ServerGuidesList(props: ServerGuidesListDisplayProps) {
    return (
        <ErrorCatch message="Could not load guides">
            <ServerGuidesListDisplay {...props} />
        </ErrorCatch>
    );
}
