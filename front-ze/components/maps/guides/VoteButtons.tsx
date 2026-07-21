'use client'

import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from 'components/ui/button';
import { toast } from 'sonner';
import { VoteType } from 'types/guides';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from 'components/ui/tooltip';
import { useTranslations } from 'next-intl';

interface VoteButtonsProps {
    upvotes: number;
    downvotes: number;
    userVote: VoteType | null | undefined;
    onVote: (voteType: VoteType) => Promise<{ upvotes: number; downvotes: number; user_vote: VoteType | null }>;
    disabled?: boolean;
    compact?: boolean; // For comments
    isBanned?: boolean;
    banReason?: string | null;
}

export default function VoteButtons({
    upvotes: initialUpvotes,
    downvotes: initialDownvotes,
    userVote: initialUserVote,
    onVote,
    disabled = false,
    compact = false,
    isBanned = false,
    banReason = null
}: VoteButtonsProps) {
    const t = useTranslations('guides');
    const [upvotes, setUpvotes] = useState(initialUpvotes);
    const [downvotes, setDownvotes] = useState(initialDownvotes);
    const [userVote, setUserVote] = useState<VoteType | null>(initialUserVote || null);
    const [isVoting, setIsVoting] = useState(false);

    const handleVote = async (voteType: VoteType) => {
        if (disabled || isVoting) return;

        // Store previous state for rollback
        const prevUpvotes = upvotes;
        const prevDownvotes = downvotes;
        const prevUserVote = userVote;

        // Optimistic update
        let newUpvotes = upvotes;
        let newDownvotes = downvotes;
        let newUserVote: VoteType | null = voteType;

        if (userVote === voteType) {
            // Remove vote
            newUserVote = null;
            if (voteType === 'UpVote') {
                newUpvotes--;
            } else {
                newDownvotes--;
            }
        } else if (userVote) {
            // Change vote
            if (userVote === 'UpVote') {
                newUpvotes--;
            } else {
                newDownvotes--;
            }
            if (voteType === 'UpVote') {
                newUpvotes++;
            } else {
                newDownvotes++;
            }
        } else {
            // New vote
            if (voteType === 'UpVote') {
                newUpvotes++;
            } else {
                newDownvotes++;
            }
        }

        setUpvotes(newUpvotes);
        setDownvotes(newDownvotes);
        setUserVote(newUserVote);
        setIsVoting(true);

        try {
            const result = await onVote(voteType);
            // Update with server response (in case of drift)
            setUpvotes(result.upvotes);
            setDownvotes(result.downvotes);
            setUserVote(result.user_vote);
        } catch (error: any) {
            // Rollback on error
            setUpvotes(prevUpvotes);
            setDownvotes(prevDownvotes);
            setUserVote(prevUserVote);
            toast.error(t('voteFailed'), {
                description: error.message || t('tryAgainLater')
            });
        } finally {
            setIsVoting(false);
        }
    };

    const buttonSize = compact ? 'sm' : 'default';
    const iconSize = compact ? 'h-3 w-3' : 'h-4 w-4';
    const isDisabled = disabled || isVoting || isBanned;

    const buttons = (
        <div className="flex items-center gap-2">
            <Button
                size={buttonSize}
                variant={userVote === 'UpVote' ? 'default' : 'ghost'}
                onClick={() => handleVote('UpVote')}
                disabled={isDisabled}
                className="flex items-center gap-1"
                aria-label={t('upvote')}
            >
                <ThumbsUp className={iconSize} />
                <span className={compact ? 'text-xs' : 'text-sm'}>{upvotes}</span>
            </Button>
            <Button
                size={buttonSize}
                variant={userVote === 'DownVote' ? 'default' : 'ghost'}
                onClick={() => handleVote('DownVote')}
                disabled={isDisabled}
                className="flex items-center gap-1"
                aria-label={t('downvote')}
            >
                <ThumbsDown className={iconSize} />
                <span className={compact ? 'text-xs' : 'text-sm'}>{downvotes}</span>
            </Button>
        </div>
    );

    if (isBanned) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span>{buttons}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p className="font-semibold">{t('youAreBanned')}</p>
                        {banReason && <p className="text-sm text-muted-foreground">{banReason}</p>}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return buttons;
}
