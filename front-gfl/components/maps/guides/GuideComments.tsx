'use client'

import {useState, useEffect} from 'react';
import { GuideComment, VoteType} from 'types/guides';
import { Card } from 'components/ui/card';
import { Button } from 'components/ui/button';
import { Textarea } from 'components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar';
import { Skeleton } from 'components/ui/skeleton';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from 'components/ui/alert-dialog';
import { AlertTriangle, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import VoteButtons from './VoteButtons';
import CommentActionsMenu from './CommentActionsMenu';
import PaginationPage from '../../ui/PaginationPage';
import LoginDialog from '../../ui/LoginDialog';
import ErrorCatch from '../../ui/ErrorMessage';
import { fetchApiUrl} from 'utils/generalUtils';
import {SteamSession} from "../../../auth.ts";
import {useGuideContext} from "../../../lib/GuideContextProvider.tsx";
import {resolveGuideLink} from "../../../app/maps/[map_name]/guides/util.ts";
import ReportDialog from "components/maps/guides/ReportDialog.tsx";
import { useTranslations } from 'next-intl';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from 'components/ui/tooltip';

dayjs.extend(relativeTime);

interface GuideCommentsDisplayProps {
    session: SteamSession | null;
}

function GuideCommentsDisplay({ session }: GuideCommentsDisplayProps) {
    const t = useTranslations('guides.comments');
    const { mapName, guide, serverId } = useGuideContext()
    const isBanned = session?.isBanned ?? false
    const banReason = session?.banReason ?? null

    const [comments, setComments] = useState<GuideComment[]>([]);
    const [totalComments, setTotalComments] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [loginDialogOpen, setLoginDialogOpen] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const [reportCommentId, setReportCommentId] = useState<string>(null)
    const handleReport = async (comment_id: string, reason: string, details?: string) => {
        const data = await fetchApiUrl(
            resolveGuideLink(serverId, `/${mapName}/guides/${guide.id}/comments/${comment_id}/report`),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, details })
            }
        );

        if (data !== "OK") {
            throw new Error(data || 'Failed to submit report');
        }
    };


    const guideId = guide.id
    // Fetch comments
    useEffect(() => {
        const abortController = new AbortController();

        setLoading(true);
        setError(null);

        fetchApiUrl(resolveGuideLink(serverId, `/${mapName}/guides/${guideId}/comments`), {
            params: { page: page.toString() },
            signal: abortController.signal
        })
            .then(data => {
                setComments(data.comments);
                setTotalComments(data.total_comments);
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    setError(err.message);
                }
            })
            .finally(() => setLoading(false));

        return () => abortController.abort();
    }, [serverId, mapName, guideId, page]);

    const handleSubmitComment = async () => {
        if (!session) {
            setLoginDialogOpen(true);
            return;
        }

        if (!newComment.trim()) {
            toast.error(t('emptyError'));
            return;
        }

        setSubmitting(true);
        try {
            const data = await fetchApiUrl(
                resolveGuideLink(serverId,`/${mapName}/guides/${guideId}/comments`),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newComment })
                }
            );

            if (data) {
                // Add new comment to the top of the list (optimistic update)
                setComments([data, ...comments]);
                setTotalComments(totalComments + 1);
                setNewComment('');
                toast.success(t('postSuccess'));
            } else {
                toast.error(data.msg || t('postFailed'));
            }
        } catch (error: any) {
            toast.error(t('postFailed'), {
                description: error.message
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleVoteComment = async (commentId: string, voteType: VoteType) => {
        const comment = comments.find(c => c.id === commentId);
        if (!comment) throw new Error('Comment not found');

        const shouldRemoveVote = comment.user_vote === voteType;
        const method = shouldRemoveVote ? 'DELETE' : 'POST';
        const options: any = { method };

        if (!shouldRemoveVote) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify({ vote_type: voteType });
        }
        try{
           return await fetchApiUrl(
               resolveGuideLink(serverId, `/${mapName}/guides/${guideId}/comments/${commentId}/vote`),
                options
            );
        }catch (e) {
            throw new Error(e.message || 'Failed to vote');
        }
    };

    const handleEditComment = async (commentId: string) => {
        if (!editContent.trim()) {
            toast.error(t('emptyError'));
            return;
        }

        if (editContent.length > 2000) {
            toast.error(t('tooLong', {max: 2000}));
            return;
        }

        try {
            const data = await fetchApiUrl(
                resolveGuideLink(serverId, `/${mapName}/guides/${guideId}/comments/${commentId}`),
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: editContent })
                }
            );

            if (data) {
                // Update comment in local state (optimistic update)
                setComments(comments.map(c =>
                    c.id === commentId ? { ...c, content: editContent, updated_at: new Date().toISOString() } : c
                ));
                setEditingCommentId(null);
                setEditContent('');
                toast.success(t('updateSuccess'));
            } else {
                toast.error(t('updateFailed'));
            }
        } catch (error: any) {
            toast.error(t('updateFailed'), {
                description: error.message
            });
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            await fetchApiUrl(
                resolveGuideLink(serverId, `/${mapName}/guides/${guideId}/comments/${commentId}`),
                { method: 'DELETE' }
            );

            // Remove from local state
            setComments(comments.filter(c => c.id !== commentId));
            setTotalComments(totalComments - 1);
            toast.success(t('deleteSuccess'));
        } catch (error: any) {
            toast.error(t('deleteFailed'), {
                description: error.message
            });
        } finally {
            setDeleteDialogOpen(false);
            setDeleteCommentId(null);
        }
    };

    const totalPages = Math.ceil(totalComments / 20);

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <MessageCircle className="h-6 w-6" />
                {t('title', {count: totalComments})}
            </h2>

            {/* Add Comment Form */}
            <Card className="p-4 mb-6">
                {isBanned && (
                    <div className="text-sm text-destructive mb-2">
                        {t('bannedFromCommenting')}
                        {banReason && <span className="text-muted-foreground ml-1">{t('reason', {reason: banReason})}</span>}
                    </div>
                )}
                <Textarea
                    placeholder={isBanned ? t('bannedPlaceholder') : (session ? t('sharePlaceholder') : t('loginToComment'))}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    disabled={!session || submitting || isBanned}
                    className="mb-2"
                />
                <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">
                        {t('charCount', {count: newComment.length, max: 2000})}
                    </p>
                    {isBanned ? (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span>
                                        <Button disabled>{t('postComment')}</Button>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="font-semibold">{t('youAreBanned')}</p>
                                    {banReason && <p className="text-sm text-muted-foreground">{banReason}</p>}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : (
                        <Button
                            onClick={handleSubmitComment}
                            disabled={!session || submitting || !newComment.trim()}
                        >
                            {submitting ? t('posting') : t('postComment')}
                        </Button>
                    )}
                </div>
            </Card>

            {/* Loading State */}
            {loading && (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} className="p-4">
                            <div className="flex gap-3">
                                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                                <div className="flex-1">
                                    <Skeleton className="h-4 w-32 mb-2" />
                                    <Skeleton className="h-4 w-full mb-1" />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
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
            {!loading && !error && comments.length === 0 && (
                <Card className="p-8">
                    <div className="text-center text-muted-foreground">
                        <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>{t('noComments')}</p>
                    </div>
                </Card>
            )}

            {/* Comments List */}
            {!loading && !error && comments.length > 0 && (
                <>
                    <div className="space-y-4 mb-6">
                        {comments.map((comment) => {
                            const isAuthor = session?.user.steam.steamid === comment.author.id.toString();
                            const isSuperuser = session?.user?.steam?.is_superuser || false;
                            const isEditing = editingCommentId === comment.id;
                            const wasEdited = comment.created_at !== comment.updated_at;

                            return (
                                <Card key={comment.id} className="p-4">
                                    <div className="flex gap-3">
                                        <Avatar className="h-10 w-10 shrink-0">
                                            <AvatarImage src={comment.author.avatar || undefined} alt={comment.author.name} />
                                            <AvatarFallback>
                                                {comment.author.name.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <span className="font-semibold">{comment.author.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {dayjs(comment.created_at).fromNow()}
                                                    {wasEdited && <span className="ml-1">({t('edited')})</span>}
                                                </span>
                                            </div>

                                            {isEditing ? (
                                                <div className="mb-2">
                                                    <Textarea
                                                        value={editContent}
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        rows={3}
                                                        maxLength={2000}
                                                        className="mb-2"
                                                    />
                                                    <div className="flex gap-2 mb-1">
                                                        <Button size="sm" onClick={() => handleEditComment(comment.id)}>
                                                            {t('save')}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setEditingCommentId(null);
                                                                setEditContent('');
                                                            }}
                                                        >
                                                            {t('cancel')}
                                                        </Button>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t('charCount', {count: editContent.length, max: 2000})}
                                                    </p>
                                                </div>
                                            ) : (
                                                <p className="text-sm mb-2 whitespace-pre-wrap wrap-break-word">{comment.content}</p>
                                            )}

                                            <div className="flex items-center justify-between">
                                                <VoteButtons
                                                    upvotes={comment.upvotes}
                                                    downvotes={comment.downvotes}
                                                    userVote={comment.user_vote}
                                                    onVote={(voteType) => handleVoteComment(comment.id, voteType)}
                                                    disabled={!session}
                                                    compact
                                                    isBanned={isBanned}
                                                    banReason={banReason}
                                                />

                                                {session && !isEditing && (
                                                    <CommentActionsMenu
                                                        isAuthor={isAuthor}
                                                        isSuperuser={isSuperuser}
                                                        onEdit={() => {
                                                            setEditingCommentId(comment.id);
                                                            setEditContent(comment.content);
                                                        }}
                                                        onDelete={() => {
                                                            setDeleteCommentId(comment.id);
                                                            setDeleteDialogOpen(true);
                                                        }}
                                                        onReport={() => setReportCommentId(comment.id)}
                                                        isBanned={isBanned}
                                                        banReason={banReason}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <PaginationPage
                            page={page}
                            setPage={setPage}
                            totalPages={totalPages}
                        />
                    )}
                </>
            )}

            {/* Delete Comment Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('deleteDescription')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteCommentId && handleDeleteComment(deleteCommentId)}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {t('delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <ReportDialog
                open={reportCommentId !== null}
                onClose={() => setReportCommentId(null)}
                onSubmit={(reason, details) => handleReport(reportCommentId, reason, details)}
                itemType="comment"
            />
            {/* Login Dialog */}
            <LoginDialog
                open={loginDialogOpen}
                onClose={() => setLoginDialogOpen(false)}
            />
        </div>
    );
}

interface GuideCommentsProps {
    session: SteamSession | null;
}

export default function GuideComments({  session }: GuideCommentsProps) {
    const t = useTranslations('guides.comments');
    return (
        <ErrorCatch message={t('loadError')}>
            <GuideCommentsDisplay session={session} />
        </ErrorCatch>
    );
}
