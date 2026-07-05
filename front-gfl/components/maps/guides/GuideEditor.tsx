'use client'

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { GuideCategory, GuideCategoryType, CreateGuideDto, UpdateGuideDto } from 'types/guides';
import { Community } from 'types/community';
import { getCommunity } from '../../../app/getCommunity';
import { Card } from 'components/ui/card';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Textarea } from 'components/ui/textarea';
import { Label } from 'components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectGroup,
    SelectLabel,
} from 'components/ui/select';
import { toast } from 'sonner';
import {
    Heading1,
    Heading2,
    Heading3,
    Bold,
    Italic,
    List,
    ListOrdered,
    Link as LinkIcon,
    Image as ImageIcon,
    Code,
    Globe,
    Server
} from 'lucide-react';
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
import { fetchApiUrl} from 'utils/generalUtils';
import {useGuideContext} from "../../../lib/GuideContextProvider.tsx";
import {SiYoutube} from "@icons-pack/react-simple-icons";
import {resolveGuideLink} from "../../../app/maps/[map_name]/guides/util.ts";
import {SteamSession} from "../../../auth.ts";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from 'components/ui/tooltip';
import { AlertCircle } from 'lucide-react';
import {Avatar, AvatarFallback, AvatarImage} from "components/ui/avatar.tsx";
import {getServerAvatarText} from "components/ui/CommunitySelector.tsx";
import { useTranslations } from 'next-intl';
import { guideCategoryLabel } from './categoryUtils';

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
        iframe: ['src', 'title', 'allow', 'allowFullScreen', 'className', 'style']
    }
};

interface GuideEditorProps {
    mode: 'create' | 'edit';
    session?: SteamSession | null;
    defaultScope?: 'global' | 'server';
}


export default function GuideEditor({ mode, session, defaultScope }: GuideEditorProps) {
    const t = useTranslations('guides.editor');
    const tGuides = useTranslations('guides');
    const { mapName, guide, serverGoto, serverId, serverSlug } = useGuideContext();
    const router = useRouter();
    const isBanned = session?.isBanned ?? false;
    const banReason = session?.banReason ?? null;

    const [title, setTitle] = useState(guide?.title || '');
    const [content, setContent] = useState(guide?.content || '');
    const [category, setCategory] = useState<GuideCategoryType | null>(
        guide?.category || GuideCategory.GENERAL
    );
    const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Scope selection state
    // For create: use serverSlug from URL or defaultScope prop
    // For edit: use guide's server_id to determine initial scope
    const initialScope = mode === 'edit'
        ? (guide?.server_id ? 'server' : 'global')
        : (serverSlug ? 'server' : (defaultScope ?? 'global'));

    const initialServerId = mode === 'edit'
        ? (guide?.server_id ?? null)
        : (serverId ?? null);

    const [scope, setScope] = useState<'global' | 'server'>(initialScope);
    const [selectedServerId, setSelectedServerId] = useState<string | null>(initialServerId);
    const [communities, setCommunities] = useState<Community[] | null>(null);
    const [loadingServers, setLoadingServers] = useState(false);

    // Fetch communities when scope is 'server' and not on a server-specific page
    useEffect(() => {
        if (scope === 'server' && !serverSlug && !communities) {
            setLoadingServers(true);
            getCommunity()
                .then(setCommunities)
                .finally(() => setLoadingServers(false));
        }
    }, [scope, serverSlug, communities]);

    // Dialog state for markdown insertion
    type MarkdownType = 'heading1' | 'heading2' | 'heading3' | 'bold' | 'italic' | 'list' | 'ordered-list' | 'link' | 'image' | 'youtube' | 'code-inline' | 'code-block';
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState<MarkdownType | null>(null);
    const [dialogInputs, setDialogInputs] = useState<Record<string, string>>({});

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!title.trim()) {
            newErrors.title = t('titleRequired');
        } else if (title.length < 5) {
            newErrors.title = t('titleTooShort', {min: 5});
        } else if (title.length > 200) {
            newErrors.title = t('titleTooLong', {max: 200});
        }

        if (!content.trim()) {
            newErrors.content = t('contentRequired');
        } else if (content.length < 50) {
            newErrors.content = t('contentTooShort', {min: 50});
        }

        if (!category) {
            newErrors.category = t('categoryRequired');
        }

        // Validate server selection when scope is 'server' and no server context from URL
        if (scope === 'server' && !serverSlug && !selectedServerId) {
            newErrors.server = t('serverRequired');
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const insertMarkdown = (markdown: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = content.substring(0, start);
        const after = content.substring(end);

        const newContent = before + markdown + after;
        setContent(newContent);

        // Set cursor position after inserted text
        setTimeout(() => {
            textarea.focus();
            const newPosition = start + markdown.length;
            textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
    };

    const openMarkdownDialog = (type: MarkdownType) => {
        setDialogType(type);
        setDialogInputs({});
        setDialogOpen(true);
    };

    const handleDialogSubmit = () => {
        if (!dialogType) return;

        let markdown = '';

        switch (dialogType) {
            case 'heading1':
                markdown = `# ${dialogInputs.text || ''}\n\n`;
                break;
            case 'heading2':
                markdown = `## ${dialogInputs.text || ''}\n\n`;
                break;
            case 'heading3':
                markdown = `### ${dialogInputs.text || ''}\n\n`;
                break;
            case 'bold':
                markdown = `**${dialogInputs.text || ''}**`;
                break;
            case 'italic':
                markdown = `*${dialogInputs.text || ''}*`;
                break;
            case 'list':
            case 'ordered-list': {
                const items = (dialogInputs.items || '').split(',').map(item => item.trim()).filter(Boolean);
                markdown = items
                    .map((item, index) =>
                        dialogType === 'ordered-list' ? `${index + 1}. ${item}` : `- ${item}`
                    )
                    .join('\n');
                if (markdown) markdown = `\n${markdown}\n\n`;
                break;
            }
            case 'link':
                markdown = `[${dialogInputs.text || ''}](${dialogInputs.url || ''})`;
                break;
            case 'image':
                markdown = `![${dialogInputs.alt || ''}](${dialogInputs.url || ''})`;
                break;
            case 'youtube':
                markdown = `[${dialogInputs.description || 'YouTube video'}](${dialogInputs.url || ''})`;
                break;
            case 'code-inline':
                markdown = `\`${dialogInputs.code || ''}\``;
                break;
            case 'code-block':
                markdown = `\n\`\`\`${dialogInputs.language || ''}\n${dialogInputs.code || ''}\n\`\`\`\n\n`;
                break;
        }

        insertMarkdown(markdown);
        setDialogOpen(false);
        setDialogInputs({});
    };

    const handleSubmit = async () => {
        if (!validate()) {
            toast.error(t('fixErrors'));
            return;
        }

        setSubmitting(true);
        try {
            // Determine effective server ID based on scope
            const effectiveServerId = scope === 'server' ? selectedServerId : null;

            // Build request body
            const body = mode === 'create'
                ? { title, content, category } as CreateGuideDto
                : {
                    title,
                    content,
                    category,
                    server_id: effectiveServerId  // Include server_id in update
                  } as UpdateGuideDto;

            // For create: use the selected scope to determine endpoint
            // For edit: always use the original guide's endpoint, backend handles server_id change
            const endpoint = mode === 'create'
                ? resolveGuideLink(effectiveServerId, `/${mapName}/guides`)
                : resolveGuideLink(serverId, `/${mapName}/guides/${guide?.id}`);

            const method = mode === 'create' ? 'POST' : 'PUT';

            const data = await fetchApiUrl(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const guideSlug = data.slug
            toast.success(
                mode === 'create' ? t('createSuccess') : t('updateSuccess')
            );
            // Navigate to the guide detail page based on the new scope
            router.refresh(); // Force refresh to invalidate cache
            router.push(resolveGuideLink(effectiveServerId, `/${mapName}/guides/${guideSlug}`))
        } catch (error: any) {
            toast.error(mode === 'create' ? t('createFailed') : t('updateFailed'), {
                description: error.message
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = () => {
        if (mode === 'edit' && guide) {
            router.push(resolveGuideLink(serverGoto, `/${mapName}/guides/${guide.slug}`));
        } else {
            router.push(resolveGuideLink(serverGoto, `/${mapName}/guides`));
        }
    };

    return (
        <div className="space-y-6">
            {/* Ban Warning */}
            {isBanned && (
                <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <p className="font-semibold text-destructive">
                            {mode === 'create' ? t('bannedCreating') : t('bannedEditing')}
                        </p>
                    </div>
                    {banReason && <p className="text-sm text-muted-foreground mt-1 ml-7">{t('reason', {reason: banReason})}</p>}
                </div>
            )}

            {/* Title Field */}
            <div className="space-y-2">
                <Label htmlFor="title">
                    {t('title')} <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('titlePlaceholder')}
                    maxLength={200}
                    className={errors.title ? 'border-destructive' : ''}
                />
                <div className="flex justify-between text-xs">
                    {errors.title ? (
                        <span className="text-destructive">{errors.title}</span>
                    ) : (
                        <span className="text-muted-foreground">
                            {t('titleHint')}
                        </span>
                    )}
                    <span className="text-muted-foreground">{title.length}/200</span>
                </div>
            </div>

            {/* Category Field */}
            <div className="space-y-2">
                <Label htmlFor="category">
                    {t('category')} <span className="text-destructive">*</span>
                </Label>
                <Select value={category} onValueChange={(value) => setCategory(value as GuideCategoryType)}>
                    <SelectTrigger id="category" className={errors.category ? 'border-destructive' : ''}>
                        <SelectValue placeholder={t('selectCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(GuideCategory).map(([key, label]) => (
                            <SelectItem key={key} value={label}>
                                {guideCategoryLabel(tGuides, label)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.category && (
                    <span className="text-xs text-destructive">{errors.category}</span>
                )}
            </div>

            {/* Scope Field */}
            <div className="space-y-2">
                <Label>
                    {t('scope')} <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant={scope === 'global' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                            setScope('global');
                            setSelectedServerId(null);
                        }}
                        className="flex items-center gap-1"
                    >
                        <Globe className="h-4 w-4" />
                        {t('global')}
                    </Button>
                    <Button
                        type="button"
                        variant={scope === 'server' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                            setScope('server');
                            if (serverSlug) {
                                setSelectedServerId(serverId);
                            }
                        }}
                        className="flex items-center gap-1"
                    >
                        <Server className="h-4 w-4" />
                        {t('serverSpecific')}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    {scope === 'global'
                        ? t('globalHint')
                        : t('serverHint')}
                </p>
            </div>

            {/* Server Selection - Show when scope=server and not on server-specific page */}
            {scope === 'server' && !serverSlug && (
                <div className="space-y-2">
                    <Label htmlFor="server">
                        {t('server')} <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={selectedServerId ?? ''}
                        onValueChange={setSelectedServerId}
                        disabled={loadingServers}
                    >
                        <SelectTrigger id="server" className={errors.server ? 'border-destructive' : ''}>
                            <SelectValue placeholder={loadingServers ? t('loadingServers') : t('selectServer')} />
                        </SelectTrigger>
                        <SelectContent>
                            {communities?.map((community) => (
                                <SelectGroup key={community.id}>
                                    <SelectLabel className="flex items-center gap-2">
                                        {community.icon_url && (
                                            <Avatar className="w-5 h-5 sm:w-5 sm:h-5 font-bold">
                                                <AvatarImage src={community.icon_url} alt={community.name} />
                                                <AvatarFallback>
                                                    {getServerAvatarText(community.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}
                                        {community.shorten_name || community.name}
                                    </SelectLabel>
                                    {community.servers.map((server) => (
                                        <SelectItem key={server.id} value={server.id}>
                                            {server.name}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors.server && (
                        <span className="text-xs text-destructive">{errors.server}</span>
                    )}
                </div>
            )}

            {/* Content Field with Tabs */}
            <div className="space-y-2">
                <Label htmlFor="content">
                    {t('content')} <span className="text-destructive">*</span>
                </Label>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="edit">{t('edit')}</TabsTrigger>
                        <TabsTrigger value="preview">{t('preview')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="edit" className="space-y-2">
                        {/* Markdown Toolbar */}
                        <Card className="p-2">
                            <div className="flex flex-wrap gap-1">
                                {/* Headings */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('heading1')}
                                    title={t('insertH1')}
                                >
                                    <Heading1 className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('heading2')}
                                    title={t('insertH2')}
                                >
                                    <Heading2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('heading3')}
                                    title={t('insertH3')}
                                >
                                    <Heading3 className="h-4 w-4" />
                                </Button>

                                <div className="w-px h-8 bg-border mx-1" />

                                {/* Text Formatting */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('bold')}
                                    title={t('insertBold')}
                                >
                                    <Bold className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('italic')}
                                    title={t('insertItalic')}
                                >
                                    <Italic className="h-4 w-4" />
                                </Button>

                                <div className="w-px h-8 bg-border mx-1" />

                                {/* Lists */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('list')}
                                    title={t('insertList')}
                                >
                                    <List className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('ordered-list')}
                                    title={t('insertOrderedList')}
                                >
                                    <ListOrdered className="h-4 w-4" />
                                </Button>

                                <div className="w-px h-8 bg-border mx-1" />

                                {/* Media */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('link')}
                                    title={t('insertLink')}
                                >
                                    <LinkIcon className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('image')}
                                    title={t('insertImage')}
                                >
                                    <ImageIcon className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('youtube')}
                                    title={t('insertYoutube')}
                                >
                                    <SiYoutube className="h-4 w-4" />
                                </Button>

                                <div className="w-px h-8 bg-border mx-1" />

                                {/* Code */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('code-inline')}
                                    title={t('insertInlineCode')}
                                >
                                    <Code className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openMarkdownDialog('code-block')}
                                    title={t('insertCodeBlock')}
                                    className="gap-1"
                                >
                                    <Code className="h-4 w-4" />
                                    <span className="text-xs">{t('block')}</span>
                                </Button>
                            </div>
                        </Card>

                        <Textarea
                            ref={textareaRef}
                            id="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder={t('contentPlaceholder')}
                            rows={20}
                            className={errors.content ? 'border-destructive font-mono text-sm' : 'font-mono text-sm'}
                        />
                        <div className="flex justify-between text-xs">
                            {errors.content ? (
                                <span className="text-destructive">{errors.content}</span>
                            ) : (
                                <span className="text-muted-foreground">
                                    {t('markdownSupported')}
                                </span>
                            )}
                            <span className="text-muted-foreground">{t('charCountSimple', {count: content.length})}</span>
                        </div>
                        <Card className="p-4 bg-muted/50">
                            <p className="text-sm font-medium mb-2">{t('markdownTips')}</p>
                            <ul className="text-xs space-y-1 text-muted-foreground">
                                <li>• {t('tipHeadings')}</li>
                                <li>• {t('tipBold')}</li>
                                <li>• {t('tipLists')}</li>
                                <li>• {t('tipLinks')}</li>
                                <li>• {t('tipImages')}</li>
                                <li>• {t('tipYoutube')}</li>
                                <li>• {t('tipCode')}</li>
                            </ul>
                        </Card>
                    </TabsContent>
                    <TabsContent value="preview">
                        <Card className="p-6 min-h-100">
                            {content.trim() ? (
                                <div className="prose dark:prose-invert max-w-none">
                                    <Markdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[[
                                            rehypeSanitize,
                                            sanitizeSchema]]}
                                        components={{
                                            a: ({ node, href, children, ...props }) => {
                                                // Check if it's a YouTube link
                                                const youtubeMatch = href?.match(
                                                    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
                                                );

                                                if (youtubeMatch) {
                                                    const videoId = youtubeMatch[1];
                                                    return (
                                                        <div className="not-prose my-6">
                                                            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                                                                <iframe
                                                                    className="absolute top-0 left-0 w-full h-full rounded-lg"
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
                                                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                                                        {children}
                                                    </a>
                                                );
                                            }
                                        }}
                                    >
                                        {content}
                                    </Markdown>
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-center py-12">
                                    {t('previewEmpty')}
                                </p>
                            )}
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t">
                <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={submitting}
                >
                    {t('cancel')}
                </Button>
                {isBanned ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span>
                                    <Button disabled>
                                        {mode === 'create' ? t('createGuide') : t('saveChanges')}
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
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting
                            ? (mode === 'create' ? t('creating') : t('saving'))
                            : (mode === 'create' ? t('createGuide') : t('saveChanges'))}
                    </Button>
                )}
            </div>

            {/* Markdown Input Dialog */}
            <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {dialogType === 'heading1' && t('insertH1')}
                            {dialogType === 'heading2' && t('insertH2')}
                            {dialogType === 'heading3' && t('insertH3')}
                            {dialogType === 'bold' && t('insertBold')}
                            {dialogType === 'italic' && t('insertItalic')}
                            {dialogType === 'list' && t('insertList')}
                            {dialogType === 'ordered-list' && t('insertOrderedList')}
                            {dialogType === 'link' && t('insertLink')}
                            {dialogType === 'image' && t('insertImage')}
                            {dialogType === 'youtube' && t('insertYoutube')}
                            {dialogType === 'code-inline' && t('insertInlineCode')}
                            {dialogType === 'code-block' && t('insertCodeBlock')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {(dialogType === 'heading1' || dialogType === 'heading2' || dialogType === 'heading3') &&
                                t('enterHeadingText')}
                            {(dialogType === 'bold' || dialogType === 'italic') &&
                                t('enterTextToFormat')}
                            {(dialogType === 'list' || dialogType === 'ordered-list') &&
                                t('enterListItems')}
                            {dialogType === 'link' && t('enterLinkTextUrl')}
                            {dialogType === 'image' && t('enterImageDescUrl')}
                            {dialogType === 'youtube' && t('enterYoutubeUrlDesc')}
                            {(dialogType === 'code-inline' || dialogType === 'code-block') &&
                                t('enterCode')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Heading, Bold, Italic - single text input */}
                        {(dialogType === 'heading1' || dialogType === 'heading2' || dialogType === 'heading3' ||
                            dialogType === 'bold' || dialogType === 'italic') && (
                            <div className="space-y-2">
                                <Label htmlFor="text">{t('text')}</Label>
                                <Input
                                    id="text"
                                    value={dialogInputs.text || ''}
                                    onChange={(e) => setDialogInputs({ ...dialogInputs, text: e.target.value })}
                                    placeholder={t('enterText')}
                                    autoFocus
                                />
                            </div>
                        )}

                        {/* Lists - comma-separated items */}
                        {(dialogType === 'list' || dialogType === 'ordered-list') && (
                            <div className="space-y-2">
                                <Label htmlFor="items">{t('listItems')}</Label>
                                <Input
                                    id="items"
                                    value={dialogInputs.items || ''}
                                    onChange={(e) => setDialogInputs({ ...dialogInputs, items: e.target.value })}
                                    placeholder={t('listItemsPlaceholder')}
                                    autoFocus
                                />
                            </div>
                        )}

                        {/* Link - text and URL */}
                        {dialogType === 'link' && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="link-text">{t('linkText')}</Label>
                                    <Input
                                        id="link-text"
                                        value={dialogInputs.text || ''}
                                        onChange={(e) => setDialogInputs({ ...dialogInputs, text: e.target.value })}
                                        placeholder={t('linkTextPlaceholder')}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="link-url">{t('url')}</Label>
                                    <Input
                                        id="link-url"
                                        value={dialogInputs.url || ''}
                                        onChange={(e) => setDialogInputs({ ...dialogInputs, url: e.target.value })}
                                        placeholder="https://example.com"
                                    />
                                </div>
                            </>
                        )}

                        {/* Image - alt and URL */}
                        {dialogType === 'image' && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="image-alt">{t('imageAlt')}</Label>
                                    <Input
                                        id="image-alt"
                                        value={dialogInputs.alt || ''}
                                        onChange={(e) => setDialogInputs({ ...dialogInputs, alt: e.target.value })}
                                        placeholder={t('imageAltPlaceholder')}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="image-url">{t('imageUrl')}</Label>
                                    <Input
                                        id="image-url"
                                        value={dialogInputs.url || ''}
                                        onChange={(e) => setDialogInputs({ ...dialogInputs, url: e.target.value })}
                                        placeholder="https://example.com/image.jpg"
                                    />
                                </div>
                            </>
                        )}

                        {/* YouTube - URL and description */}
                        {dialogType === 'youtube' && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="youtube-url">{t('youtubeUrl')}</Label>
                                    <Input
                                        id="youtube-url"
                                        value={dialogInputs.url || ''}
                                        onChange={(e) => setDialogInputs({ ...dialogInputs, url: e.target.value })}
                                        placeholder="https://www.youtube.com/watch?v=..."
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="youtube-description">{t('youtubeDesc')}</Label>
                                    <Input
                                        id="youtube-description"
                                        value={dialogInputs.description || ''}
                                        onChange={(e) => setDialogInputs({ ...dialogInputs, description: e.target.value })}
                                        placeholder={t('youtubeDescPlaceholder')}
                                    />
                                </div>
                            </>
                        )}

                        {/* Inline Code - single input */}
                        {dialogType === 'code-inline' && (
                            <div className="space-y-2">
                                <Label htmlFor="code">{t('code')}</Label>
                                <Input
                                    id="code"
                                    value={dialogInputs.code || ''}
                                    onChange={(e) => setDialogInputs({ ...dialogInputs, code: e.target.value })}
                                    placeholder="const x = 1"
                                    className="font-mono"
                                    autoFocus
                                />
                            </div>
                        )}

                        {/* Code Block - language and code */}
                        {dialogType === 'code-block' && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="language">{t('language')}</Label>
                                    <Input
                                        id="language"
                                        value={dialogInputs.language || ''}
                                        onChange={(e) => setDialogInputs({ ...dialogInputs, language: e.target.value })}
                                        placeholder={t('languagePlaceholder')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="code-block">{t('code')}</Label>
                                    <Textarea
                                        id="code-block"
                                        value={dialogInputs.code || ''}
                                        onChange={(e) => setDialogInputs({ ...dialogInputs, code: e.target.value })}
                                        placeholder={t('codePlaceholder')}
                                        className="font-mono"
                                        rows={6}
                                        autoFocus
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDialogInputs({})}>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDialogSubmit}>{t('insert')}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
