'use client'

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Guide } from 'types/guides';
import { Card } from 'components/ui/card';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar';
import { ThumbsUp, ThumbsDown, MessageCircle, Map, ArrowRight } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getMapImage } from 'utils/generalUtils';
import { Skeleton } from 'components/ui/skeleton';

dayjs.extend(relativeTime);

interface ServerGuideCardProps {
    guide: Guide;
    serverId: string;
    serverGotoLink: string;
}

export default function ServerGuideCard({ guide, serverId, serverGotoLink }: ServerGuideCardProps) {
    const [mapImage, setMapImage] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(true);

    useEffect(() => {
        setImageLoading(true);
        getMapImage(serverId, guide.map_name)
            .then(e => setMapImage(e ? e.large : null))
            .finally(() => setImageLoading(false));
    }, [serverId, guide.map_name]);

    const excerpt = guide.content
        .replace(/[#*`\[\]()]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 120) + (guide.content.length > 120 ? '...' : '');

    const guideUrl = `/servers/${serverGotoLink}/maps/${guide.map_name}/guides/${guide.slug}`;
    const mapGuidesUrl = `/servers/${serverGotoLink}/maps/${guide.map_name}/guides`;
    const timeAgo = dayjs(guide.created_at).fromNow();

    return (
        <Card className="overflow-hidden h-full flex flex-col">
            {/* Map Image */}
            <div className="relative h-48 bg-muted">
                {imageLoading ? (
                    <Skeleton className="h-full w-full" />
                ) : mapImage ? (
                    <img
                        src={mapImage}
                        alt={guide.map_name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        No Image
                    </div>
                )}

                {/* Map Name Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-white font-semibold text-sm truncate">
                        {guide.map_name}
                    </p>
                </div>

                {/* Category Badge */}
                <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="shadow-md">
                        {guide.category}
                    </Badge>
                </div>
            </div>

            {/* Content */}
            <div className="p-4 flex-1 flex flex-col">
                {/* Title */}
                <h3 className="text-lg font-bold mb-2 line-clamp-2">
                    {guide.title}
                </h3>

                {/* Excerpt */}
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2 flex-1">
                    {excerpt}
                </p>

                {/* Author */}
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={guide.author.avatar || undefined} alt={guide.author.name} />
                        <AvatarFallback>
                            {guide.author.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{guide.author.name}</p>
                        <p className="text-xs text-muted-foreground">{timeAgo}</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                        <ThumbsUp className="h-3.5 w-3.5" />
                        <span>{guide.upvotes}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <ThumbsDown className="h-3.5 w-3.5" />
                        <span>{guide.downvotes}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>{guide.comment_count}</span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                    <Button variant="ghost" size="sm" asChild className="flex-1">
                        <Link href={mapGuidesUrl}>
                            <Map className="mr-1.5 h-4 w-4" />
                            Map Guides
                        </Link>
                    </Button>
                    <Button size="sm" asChild className="flex-1">
                        <Link href={guideUrl}>
                            View Guide
                            <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>
        </Card>
    );
}
