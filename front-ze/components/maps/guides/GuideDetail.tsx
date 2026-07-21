'use client'

import {useState} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import {  VoteType } from 'types/guides';
import { Card } from 'components/ui/card';
import { Badge } from 'components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar';
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
import { ArrowLeft, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import VoteButtons from './VoteButtons';
import ReportDialog from './ReportDialog';
import GuideActionsMenu from './GuideActionsMenu';
import { fetchApiUrl} from 'utils/generalUtils';
import {SteamSession} from "auth";
import Markdown from "react-markdown";
import {useGuideContext} from "lib/GuideContextProvider.tsx";
import {resolveGuideLink} from "../../../app/maps/[map_name]/guides/util.ts";
import { useTranslations } from 'next-intl';
import { guideCategoryLabel } from './categoryUtils';

dayjs.extend(relativeTime);

// Generate slug from heading text
const generateSlug = (text: string): string => {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
};

// Configure sanitize schema to allow all necessary tags
const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [
        ...(defaultSchema.tagNames || []),
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', // Ensure headings are allowed
        'iframe' // For YouTube embeds
    ],
    attributes: {
        ...defaultSchema.attributes,
        iframe: ['src', 'title', 'allow', 'allowFullScreen', 'className', 'style'],
        // Allow id attribute on headings for jump links
        h1: ['id', 'className'],
        h2: ['id', 'className'],
        h3: ['id', 'className'],
        h4: ['id', 'className'],
        h5: ['id', 'className'],
        h6: ['id', 'className'],
    }
};

interface GuideDetailProps {
    session: SteamSession;
}

export default function GuideDetail({ session }: GuideDetailProps) {
    const t = useTranslations('guides.detail');
    const tGuides = useTranslations('guides');
    const { mapName, guide, serverId, serverGoto } = useGuideContext();
    const router = useRouter();
    const isBanned = session?.isBanned ?? false;
    const banReason = session?.banReason ?? null;

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [reportDialogOpen, setReportDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    if (!guide){
        return <div className="container max-w-4xl mx-auto px-4 py-6">
            <div className="text-center py-12">
                <h1 className="text-2xl font-bold mb-2">{t('notFound')}</h1>
                <p className="text-muted-foreground">
                    {t('notFoundDescription')}
                </p>
            </div>
        </div>
    }

    const isAuthor = session?.user.steam.steamid === guide.author.id
    const isSuperuser = session?.user?.steam?.is_superuser || false;
    const wasEdited = guide.created_at !== guide.updated_at;
    const guidesListUrl = resolveGuideLink(serverGoto, `/${mapName}/guides`);
    const editUrl = `${guidesListUrl}/${guide.slug}/edit`;

    const handleVote = async (voteType: VoteType) => {
        const shouldRemoveVote = guide.user_vote === voteType;
        const method = shouldRemoveVote ? 'DELETE' : 'POST';
        const options: any = { method };

        if (!shouldRemoveVote) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify({ vote_type: voteType });
        }
        try{
            return await fetchApiUrl(
                resolveGuideLink(serverId, `${mapName}/guides/${guide.id}/vote`),
                options
            )
        }catch(e) {
            throw new Error(e.message || 'Failed to vote');
        }
    }

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await fetchApiUrl(
                resolveGuideLink(serverId, `${mapName}/guides/${guide.id}`),
                { method: 'DELETE' }
            );

            toast.success(t('deleteSuccess'));
            router.push(guidesListUrl);
        } catch (error: any) {
            toast.error(t('deleteFailed'), {
                description: error.message
            });
        } finally {
            setDeleting(false);
            setDeleteDialogOpen(false);
        }
    };

    const handleReport = async (reason: string, details?: string) => {
        const data = await fetchApiUrl(
            resolveGuideLink(serverId, `${mapName}/guides/${guide.id}/report`),
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

    const handleShare = () => {
        const url = `${window.location.origin}${window.location.pathname}`;
        navigator.clipboard.writeText(url);
        toast.success(t('linkCopied'));
    };
    return (
        <div>
            {/* Back Link */}
            <Link
                href={guidesListUrl}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
            >
                <ArrowLeft className="h-4 w-4" />
                {t('backToGuides')}
            </Link>

            {/* Main Guide Card */}
            <Card className="p-6">
                {/* Author Info and Category */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                            <AvatarImage src={guide.author.avatar || undefined} alt={guide.author.name} />
                            <AvatarFallback>
                                {guide.author.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-semibold">{guide.author.name}</p>
                            <p className="text-sm text-muted-foreground">
                                {t('posted', {time: dayjs(guide.created_at).fromNow()})}
                                {wasEdited && (
                                    <span className="ml-1">
                                        ({t('editedTime', {time: dayjs(guide.updated_at).fromNow()})})
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <Badge variant="secondary" className="ml-2">
                        {guideCategoryLabel(tGuides, guide.category)}
                    </Badge>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold mb-6">{guide.title}</h1>

                {/* Markdown Content */}
                <div className="mb-6">
                    <Markdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
                        components={{
                            // Links and YouTube embeds
                            a: ({ node, href, children, ...props }) => {
                                // Check if it's a YouTube link
                                const youtubeMatch = href?.match(
                                    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
                                );

                                if (youtubeMatch) {
                                    const videoId = youtubeMatch[1];
                                    return (
                                        <div className="my-6">
                                            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                                                <iframe
                                                    className="absolute top-0 left-0 w-full h-full rounded-lg border-0"
                                                    src={`https://www.youtube.com/embed/${videoId}`}
                                                    title="YouTube video player"
                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                    allowFullScreen
                                                />
                                            </div>
                                        </div>
                                    );
                                }

                                // Regular link
                                return (
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
                                        {...props}
                                    >
                                        {children}
                                    </a>
                                );
                            },
                            // Heading components with jump links
                            h1: ({ node, children, ...props }) => {
                                const text = children?.toString() || '';
                                const id = generateSlug(text);
                                return (
                                    <h1
                                        id={id}
                                        className="group relative scroll-mt-20 text-4xl font-bold mt-8 mb-4 first:mt-0"
                                        {...props}
                                    >
                                        {children}
                                        <a
                                            href={`#${id}`}
                                            className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <LinkIcon className="h-5 w-5 text-muted-foreground" />
                                        </a>
                                    </h1>
                                );
                            },
                            h2: ({ node, children, ...props }) => {
                                const text = children?.toString() || '';
                                const id = generateSlug(text);
                                return (
                                    <h2
                                        id={id}
                                        className="group relative scroll-mt-20 text-3xl font-bold mt-8 mb-4 first:mt-0"
                                        {...props}
                                    >
                                        <a
                                            href={`#${id}`}
                                            className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <LinkIcon className="h-5 w-5 text-muted-foreground" />
                                        </a>
                                        {children}
                                    </h2>
                                );
                            },
                            h3: ({ node, children, ...props }) => {
                                const text = children?.toString() || '';
                                const id = generateSlug(text);
                                return (
                                    <h3
                                        id={id}
                                        className="group relative scroll-mt-20 text-2xl font-bold mt-6 mb-3 first:mt-0"
                                        {...props}
                                    >
                                        <a
                                            href={`#${id}`}
                                            className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <LinkIcon className="h-5 w-5 text-muted-foreground" />
                                        </a>
                                        {children}
                                    </h3>
                                );
                            },
                            h4: ({ node, children, ...props }) => (
                                <h4 className="text-xl font-semibold mt-6 mb-3 first:mt-0" {...props}>
                                    {children}
                                </h4>
                            ),
                            h5: ({ node, children, ...props }) => (
                                <h5 className="text-lg font-semibold mt-4 mb-2 first:mt-0" {...props}>
                                    {children}
                                </h5>
                            ),
                            h6: ({ node, children, ...props }) => (
                                <h6 className="text-base font-semibold mt-4 mb-2 first:mt-0" {...props}>
                                    {children}
                                </h6>
                            ),
                            // Paragraphs
                            p: ({ node, children, ...props }) => (
                                <p className="mb-4 leading-7 last:mb-0" {...props}>
                                    {children}
                                </p>
                            ),
                            // Lists
                            ul: ({ node, children, ...props }) => (
                                <ul className="list-disc list-outside ml-6 mb-4 space-y-2" {...props}>
                                    {children}
                                </ul>
                            ),
                            ol: ({ node, children, ...props }) => (
                                <ol className="list-decimal list-outside ml-6 mb-4 space-y-2" {...props}>
                                    {children}
                                </ol>
                            ),
                            li: ({ node, children, ...props }) => (
                                <li className="leading-7" {...props}>
                                    {children}
                                </li>
                            ),
                            // Blockquotes
                            blockquote: ({ node, children, ...props }) => (
                                <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-4 text-muted-foreground" {...props}>
                                    {children}
                                </blockquote>
                            ),
                            // Code
                            code: ({ node, inline, children, ...props }: any) => {
                                if (inline) {
                                    return (
                                        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                                            {children}
                                        </code>
                                    );
                                }
                                return (
                                    <code className="block bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto my-4" {...props}>
                                        {children}
                                    </code>
                                );
                            },
                            pre: ({ node, children, ...props }) => (
                                <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-4" {...props}>
                                    {children}
                                </pre>
                            ),
                            // Tables
                            table: ({ node, children, ...props }) => (
                                <div className="overflow-x-auto my-4">
                                    <table className="w-full border-collapse border border-border" {...props}>
                                        {children}
                                    </table>
                                </div>
                            ),
                            thead: ({ node, children, ...props }) => (
                                <thead className="bg-muted" {...props}>
                                    {children}
                                </thead>
                            ),
                            tbody: ({ node, children, ...props }) => (
                                <tbody {...props}>
                                    {children}
                                </tbody>
                            ),
                            tr: ({ node, children, ...props }) => (
                                <tr className="border-b border-border" {...props}>
                                    {children}
                                </tr>
                            ),
                            th: ({ node, children, ...props }) => (
                                <th className="px-4 py-2 text-left font-semibold border border-border" {...props}>
                                    {children}
                                </th>
                            ),
                            td: ({ node, children, ...props }) => (
                                <td className="px-4 py-2 border border-border" {...props}>
                                    {children}
                                </td>
                            ),
                            // Horizontal rule
                            hr: ({ node, ...props }) => (
                                <hr className="my-8 border-border" {...props} />
                            ),
                            // Images
                            img: ({ node, src, alt, ...props }) => (
                                <img
                                    src={src}
                                    alt={alt || ''}
                                    className="max-w-full h-auto rounded-lg my-4"
                                    {...props}
                                />
                            ),
                            // Strong and emphasis
                            strong: ({ node, children, ...props }) => (
                                <strong className="font-bold" {...props}>
                                    {children}
                                </strong>
                            ),
                            em: ({ node, children, ...props }) => (
                                <em className="italic" {...props}>
                                    {children}
                                </em>
                            ),
                        }}
                    >
                        {guide.content}
                    </Markdown>
                </div>

                {/* Actions Bar */}
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t">
                    <VoteButtons
                        upvotes={guide.upvotes}
                        downvotes={guide.downvotes}
                        userVote={guide.user_vote}
                        onVote={handleVote}
                        disabled={!session}
                        isBanned={isBanned}
                        banReason={banReason}
                    />

                    <div className="ml-auto flex items-center gap-2">
                        <GuideActionsMenu
                            isAuthor={isAuthor}
                            isSuperuser={isSuperuser}
                            isLoggedIn={!!session}
                            onEdit={() => {
                                router.refresh(); // Invalidate cache before navigating to edit page
                                router.push(editUrl);
                            }}
                            onDelete={() => setDeleteDialogOpen(true)}
                            onReport={() => setReportDialogOpen(true)}
                            onShare={handleShare}
                            isBanned={isBanned}
                            banReason={banReason}
                        />
                    </div>
                </div>
            </Card>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('deleteDescription')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {deleting ? t('deleting') : t('delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Report Dialog */}
            <ReportDialog
                open={reportDialogOpen}
                onClose={() => setReportDialogOpen(false)}
                onSubmit={handleReport}
                itemType="guide"
            />
        </div>
    );
}
