'use client'

import { useState, useEffect, useMemo } from 'react';
import { Search, Map } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from 'components/ui/dialog';
import { Input } from 'components/ui/input';
import { Button } from 'components/ui/button';
import { ScrollArea } from 'components/ui/scroll-area';
import { Skeleton } from 'components/ui/skeleton';
import { fetchServerUrl } from 'utils/generalUtils';
import { ServerMap } from 'types/maps';

interface MapFilterDialogProps {
    open: boolean;
    onClose: () => void;
    onSelect: (mapName: string) => void;
    serverId: string;
}

export default function MapFilterDialog({ open, onClose, serverId, onSelect }: MapFilterDialogProps) {
    const [maps, setMaps] = useState<ServerMap[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!open) return;

        const abortController = new AbortController();
        setLoading(true);
        setError(null);

        fetchServerUrl(serverId, '/maps',
            { signal: abortController.signal }
        )
            .then((data: ServerMap[]) => {
                setMaps(data);
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    setError(err.message || 'Failed to load maps');
                }
            })
            .finally(() => setLoading(false));

        return () => abortController.abort();
    }, [open, serverId]);

    const filteredMaps = useMemo(() => {
        if (!searchQuery.trim()) return maps;
        const query = searchQuery.toLowerCase();
        return maps.filter(map => map.map.toLowerCase().includes(query));
    }, [maps, searchQuery]);

    const handleMapSelect = (mapName: string) => {
        onSelect(mapName);
        onClose();
        setSearchQuery('');
    };

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            onClose();
            setSearchQuery('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Filter by Map</DialogTitle>
                    <DialogDescription>
                        Select a map to filter guides
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search maps..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <ScrollArea className="h-[300px] pr-4">
                    {loading && (
                        <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </div>
                    )}

                    {!loading && error && (
                        <div className="text-center py-8 text-destructive">
                            <p>{error}</p>
                        </div>
                    )}

                    {!loading && !error && filteredMaps.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            <Map className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>{searchQuery ? 'No maps match your search' : 'No maps available'}</p>
                        </div>
                    )}

                    {!loading && !error && filteredMaps.length > 0 && (
                        <div className="space-y-1">
                            {filteredMaps.map((map) => (
                                <Button
                                    key={map.map}
                                    variant="ghost"
                                    className="w-full justify-start font-normal"
                                    onClick={() => handleMapSelect(map.map)}
                                >
                                    {map.map}
                                </Button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
