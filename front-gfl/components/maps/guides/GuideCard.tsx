'use client'

import Link from 'next/link';
import { Guide } from 'types/guides';
import { Card } from 'components/ui/card';
import { Badge } from 'components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar';
import { ThumbsUp, ThumbsDown, MessageCircle } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {useGuideContext} from "../../../lib/GuideContextProvider.tsx";
import {resolveGuideLink} from "../../../app/maps/[map_name]/guides/util.ts";
import {CommunitiesData} from "../../../app/getCommunity.ts";
import { useTranslations } from 'next-intl';
import { guideCategoryLabel } from './categoryUtils';

dayjs.extend(relativeTime);

interface GuideCardProps {
    guide: Guide;
    communities: CommunitiesData
}

export default function GuideCard({ guide, communities }: GuideCardProps) {
    const t = useTranslations('guides');
    const { serverGoto, insideServer } = useGuideContext()

    // Create excerpt (first 150 chars of content, stripping markdown)
    const excerpt = guide.content
        .replace(/[#*`\[\]()]/g, '') // Remove markdown characters
        .replace(/\n+/g, ' ') // Replace newlines with spaces
        .trim()
        .slice(0, 150) + (guide.content.length > 150 ? '...' : '');

    const guideUrl = resolveGuideLink(serverGoto, `/${guide.map_name}/guides/${guide.slug}`);

    const netVotes = guide.upvotes - guide.downvotes;
    const timeAgo = dayjs(guide.created_at).fromNow();
    const wasEdited = guide.created_at !== guide.updated_at;

    return (
        <Link href={guideUrl}>
            <Card className="p-4 hover:bg-accent/50 transition-colors cursor-pointer h-full">
                {/* Author and Category */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={guide.author.avatar || undefined} alt={guide.author.name} />
                            <AvatarFallback>
                                {guide.author.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{guide.author.name}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                        {!insideServer && guide.server_id && <Badge variant="secondary">
                            {guide.server_id && (communities?.serversMapped.get(String(guide.server_id))?.community_shorten_name || communities?.serversMapped.get(String(guide.server_id))?.community_name)}
                        </Badge>}
                        <Badge variant="secondary">{guideCategoryLabel(t, guide.category)}</Badge>
                    </div>
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold mb-2 line-clamp-2">{guide.title}</h3>

                {/* Excerpt */}
                <p className="text-sm text-muted-foreground mb-3 line-clamp-3">{excerpt}</p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        <span>{guide.upvotes}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <ThumbsDown className="h-3 w-3" />
                        <span>{guide.downvotes}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        <span>{guide.comment_count}</span>
                    </div>
                    <span className="ml-auto">
                        {timeAgo}{wasEdited && ` (${t('edited')})`}
                    </span>
                </div>
            </Card>
        </Link>
    );
}
