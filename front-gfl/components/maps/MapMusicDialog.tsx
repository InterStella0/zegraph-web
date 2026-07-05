'use client'

import { useState, useEffect, useRef } from "react";
import { Music, ChevronLeft, ChevronRight, Play, Link2, Flag, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {ScrollArea, ScrollBar} from "../ui/scroll-area";
import { cn } from "../lib/utils";
import { MapMusicTrack } from "types/maps";
import Link from "next/link";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider.tsx";
import MusicReportDialog from "./MusicReportDialog";
import { fetchApiUrl } from "utils/generalUtils";
import {PlayerAvatar} from "components/players/PlayerAvatar.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {useTranslations} from 'next-intl';

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface MapMusicDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tracks: MapMusicTrack[];
    initialTrackIndex?: number;
}

export default function MapMusicDialog({
    open,
    onOpenChange,
    tracks,
    initialTrackIndex = 0
}: MapMusicDialogProps) {
    const t = useTranslations('maps.music');
    const { server } = useServerData()
    const [currentIndex, setCurrentIndex] = useState(initialTrackIndex);
    const trackRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [reportDialogOpen, setReportDialogOpen] = useState(false);
    const [reportingTrack, setReportingTrack] = useState<MapMusicTrack | null>(null);

    const currentTrack = tracks[currentIndex];
    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < tracks.length - 1;

    // Reset current index when dialog opens with a new initial track
    useEffect(() => {
        if (open) {
            setCurrentIndex(initialTrackIndex);
        }
    }, [open, initialTrackIndex]);

    // Auto-scroll to current track when index changes
    useEffect(() => {
        const currentTrackElement = trackRefs.current[currentIndex];
        if (currentTrackElement) {
            currentTrackElement.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [currentIndex]);

    const goToPrevious = () => {
        if (hasPrevious) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const goToNext = () => {
        if (hasNext) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const selectTrack = (index: number) => {
        setCurrentIndex(index);
    };

    const handleReportSubmit = async (reason: string, details?: string, youtubeUrl?: string) => {
        if (!reportingTrack) return;

        await fetchApiUrl(`/music/${reportingTrack.id}/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reason,
                details: details || '',
                suggested_youtube_url: youtubeUrl || null
            })
        });
    };

    const openReportDialog = () => {
        setReportingTrack(currentTrack);
        setReportDialogOpen(true);
    };

    if (!currentTrack) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[1400px] w-[95vw] max-h-[95vh] sm:h-[90vh] flex flex-col p-3 sm:p-6">
                <DialogHeader className="space-y-2 sm:space-y-3">
                    <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <div className="flex items-center gap-2">
                            <Music className="h-5 w-5 text-primary shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <span className="truncate font-bold">{currentTrack.title}</span>
                                {currentTrack.artist && (
                                    <span className="text-sm text-muted-foreground font-normal truncate">
                                        {currentTrack.artist}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-1 ml-7 sm:ml-0">
                            <span className="text-muted-foreground font-normal hidden sm:inline">—</span>
                            <span className="text-muted-foreground font-normal text-sm sm:text-base truncate">{currentTrack.source}</span>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={openReportDialog}
                                className="gap-2"
                            >
                                <Flag className="h-4 w-4" />
                                {t('reportIssue')}
                            </Button>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 flex-1 min-h-0 overflow-hidden">
                    {/* Video Player */}
                    <div className="flex-1 min-w-0 flex flex-col">
                        {currentTrack.youtubeVideoId ? (
                            <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted">
                                <iframe
                                    className="w-full h-full"
                                    src={`https://www.youtube.com/embed/${currentTrack.youtubeVideoId}?autoplay=1`}
                                    title={currentTrack.title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    loading="lazy"
                                />
                            </div>
                        ) : (
                            <div className="aspect-video w-full rounded-lg bg-muted flex flex-col items-center justify-center">
                                <Music className="h-8 w-8 sm:h-12 sm:w-12 opacity-50 mb-2" />
                                <p className="text-xs sm:text-sm text-muted-foreground">{t('noVideo')}</p>
                            </div>
                        )}

                        {/* Track Info */}
                        <div className="mt-2 sm:mt-3 space-y-2">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                {currentTrack.contexts.map((c, idx) => <Badge key={idx} className="text-xs">
                                    {c}
                                </Badge>)}

                                <span className="text-xs sm:text-sm text-muted-foreground">
                                    {formatDuration(currentTrack.duration)}
                                </span>

                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                    {currentTrack.yt_source == "0" ? (
                                        <User className="h-3 w-3" />
                                    ) : (
                                        <PlayerAvatar
                                            uuid={currentTrack.yt_source}
                                            name={currentTrack.yt_source_name}
                                            width={16}
                                            height={16}
                                            className="shrink-0"
                                        />
                                    )}
                                    <span>{t('contributedBy', {name: currentTrack.yt_source_name})}</span>
                                </Badge>
                            </div>

                            {/* Other Maps */}
                            {currentTrack.otherMaps.length > 0 && (
                                <div className="flex items-start gap-1.5 sm:gap-2">
                                    <Link2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                                        <span className="text-xs sm:text-sm text-muted-foreground">{t('alsoUsedIn')}</span>
                                        {currentTrack.otherMaps.map((map, idx) => (
                                            <Badge key={idx} variant="secondary" className="text-xs">
                                                <HoverPrefetchLink href={`/servers/${server.gotoLink}/maps/${map}`}>
                                                    {map}
                                                </HoverPrefetchLink>
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Track List Panel */}
                    <div className="lg:w-80 flex flex-col min-h-0 max-h-[40vh] lg:max-h-[80vh]">
                        <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <h3 className="text-sm font-medium">{t('playlist')}</h3>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 sm:h-7 sm:w-7"
                                    onClick={goToPrevious}
                                    disabled={!hasPrevious}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-xs text-muted-foreground min-w-12 text-center">
                                    {currentIndex + 1} / {tracks.length}
                                </span>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 sm:h-7 sm:w-7"
                                    onClick={goToNext}
                                    disabled={!hasNext}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <ScrollArea className="flex flex-col overflow-y-auto p-2">
                            <div className="flex flex-col gap-1.5 sm:gap-2">
                                {tracks.map((track, index) => (
                                    <Button
                                        key={track.id}
                                        ref={(el) => { trackRefs.current[index] = el; }}
                                        variant={index === currentIndex ? "default" : "outline"}
                                        className={cn(
                                            "h-auto py-2.5 sm:py-2 px-2.5 sm:px-3 justify-start touch-manipulation",
                                            index === currentIndex && "ring-2 ring-primary"
                                        )}
                                        onClick={() => selectTrack(index)}
                                    >
                                        <div className="flex items-center gap-2 w-full min-w-0">
                                            {index === currentIndex && (
                                                <Play className="h-3 w-3 fill-current shrink-0" />
                                            )}
                                            <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                                                <span className="truncate text-sm font-medium w-full text-left max-w-53.5 max-sm:max-w-43.5">
                                                    {track.title}
                                                </span>
                                                {track.artist && (
                                                    <span className="truncate text-xs text-muted-foreground w-full text-left max-w-53.5 max-sm:max-w-43.5">
                                                        {track.artist}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground shrink-0">
                                                {formatDuration(track.duration)}
                                            </span>
                                        </div>
                                    </Button>
                                ))}
                            </div>
                            <ScrollBar orientation="vertical" />
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>

            {reportingTrack && (
                <MusicReportDialog
                    open={reportDialogOpen}
                    onClose={() => {
                        setReportDialogOpen(false);
                        setReportingTrack(null);
                    }}
                    onSubmit={handleReportSubmit}
                    musicTitle={reportingTrack.title}
                    currentYoutubeId={reportingTrack.youtubeVideoId}
                />
            )}
        </Dialog>
    );
}
