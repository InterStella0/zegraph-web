'use client';

import {ReactNode, useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Check, Copy, ExternalLink, MessageSquareText, ShieldCheck} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from 'components/ui/button';
import {Card, CardContent} from 'components/ui/card';
import {Tabs, TabsContent, TabsList, TabsTrigger} from 'components/ui/tabs';
import SetupStep from './SetupStep';
import {ClaudeAddConnector, ClaudeAuth, ClaudeChatTools, ClaudeConnect, ClaudeOpenConnectors} from './mockups/ClaudeScenes';
import {ChatGptChatPick, ChatGptDevMode, ChatGptNewPlugin} from './mockups/ChatGptScenes';
import {MockAnswer} from './mockups/MockAnswer';

const TABS = ['claude', 'chatgpt', 'developers'] as const;
type Tab = typeof TABS[number];
const EXAMPLES = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
const OPENAI_DEV_MODE_HELP = 'https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt';

function CopyButton({text, label, className}: { text: string, label?: string, className?: string }) {
    const t = useTranslations('mcp');
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const id = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(id);
    }, [copied]);

    const copy = async () => {
        await navigator.clipboard.writeText(text);
        toast.success(t('copied'));
        setCopied(true);
    };

    return (
        <Button
            type="button"
            variant="outline"
            size={label ? 'sm' : 'icon-sm'}
            onClick={copy}
            aria-label={label ?? t('copy')}
            className={className}
        >
            {copied ? <Check /> : <Copy />}
            {label}
        </Button>
    );
}

function Snippet({title, hint, code}: { title: string, hint?: ReactNode, code: string }) {
    return (
        <section className="space-y-2">
            <h3 className="font-semibold">{title}</h3>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
            <div className="relative">
                <pre className="overflow-x-auto rounded-md border bg-muted/50 p-4 pr-12 text-sm"><code>{code}</code></pre>
                <CopyButton text={code} className="absolute right-2 top-2" />
            </div>
        </section>
    );
}

function OpenLink({href, children}: { href: string, children: ReactNode }) {
    return (
        <Button asChild variant="secondary" size="sm">
            <a href={href} target="_blank" rel="noopener noreferrer">
                {children} <ExternalLink />
            </a>
        </Button>
    );
}

export default function McpSetupClient({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp');
    const [tab, setTab] = useState<Tab>('claude');
    const b = (chunks: ReactNode) => <strong className="font-semibold">{chunks}</strong>;

    // The tab lives in the hash, so /mcp-setup#chatgpt links straight to the ChatGPT steps.
    useEffect(() => {
        const sync = () => {
            const hash = window.location.hash.slice(1);
            if ((TABS as readonly string[]).includes(hash)) setTab(hash as Tab);
        };
        sync();
        window.addEventListener('hashchange', sync);
        return () => window.removeEventListener('hashchange', sync);
    }, []);

    const changeTab = (value: string) => {
        setTab(value as Tab);
        history.replaceState(null, '', `#${value}`);
    };

    const copyUrl = <CopyButton text={mcpUrl} label={t('copyUrl')} />;
    const cursorLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=zegraph&config=${btoa(JSON.stringify({url: mcpUrl}))}`;
    const vscodeLink = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({name: 'zegraph', type: 'http', url: mcpUrl}))}`;

    return (
        <div className="space-y-10">
            <Card>
                <CardContent className="space-y-3">
                    <div className="text-sm font-medium">{t('urlLabel')}</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            readOnly
                            value={mcpUrl}
                            onFocus={e => e.currentTarget.select()}
                            aria-label={t('urlLabel')}
                            className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-base"
                        />
                        <CopyButton text={mcpUrl} label={t('copy')} className="h-10" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('urlHint')}</p>
                </CardContent>
            </Card>

            <Tabs value={tab} onValueChange={changeTab} className="gap-6">
                <TabsList className="h-10 w-full sm:w-fit">
                    {TABS.map(key => (
                        <TabsTrigger key={key} value={key} className="px-4">{t(`tabs.${key}`)}</TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="claude" className="flex flex-col gap-6">
                    <ol className="space-y-10">
                        <SetupStep n={1} mock={<ClaudeOpenConnectors />} action={<OpenLink href="https://claude.ai">{t('open', {app: 'Claude'})}</OpenLink>}>
                            {t.rich('claude.step1', {b})}
                        </SetupStep>
                        <SetupStep n={2} mock={<ClaudeAddConnector mcpUrl={mcpUrl} />} action={copyUrl}>
                            {t.rich('claude.step2', {b})}
                        </SetupStep>
                        <SetupStep n={3} mock={<ClaudeAuth mcpUrl={mcpUrl} />}>
                            {t.rich('claude.step3', {b})}
                        </SetupStep>
                        <SetupStep n={4} mock={<ClaudeConnect mcpUrl={mcpUrl} />}>
                            {t.rich('claude.step4', {b})}
                        </SetupStep>
                        <SetupStep n={5} mock={<ClaudeChatTools />}>
                            {t.rich('claude.step5', {b})}
                        </SetupStep>
                        <SetupStep n={6} mock={<MockAnswer variant="claude" />}>
                            {t.rich('claude.step6', {b})}
                        </SetupStep>
                    </ol>
                    <div className="flex flex-col gap-1">
                        <p className="text-sm text-muted-foreground">{t('claude.note')}</p>
                        <p className="text-xs text-muted-foreground">{t('illustration')}</p>
                    </div>
                </TabsContent>

                <TabsContent value="chatgpt" className="flex flex-col gap-6">
                    <ol className="space-y-10">
                        <SetupStep n={1} mock={<ChatGptDevMode />} action={<OpenLink href="https://chatgpt.com">{t('open', {app: 'ChatGPT'})}</OpenLink>}>
                            {t.rich('chatgpt.step1', {b})}
                        </SetupStep>
                        <SetupStep n={2} mock={<ChatGptNewPlugin mcpUrl={mcpUrl} />} action={copyUrl}>
                            {t.rich('chatgpt.step2', {b})}
                        </SetupStep>
                        <SetupStep n={3} mock={<ChatGptChatPick />}>
                            {t.rich('chatgpt.step3', {b})}
                        </SetupStep>
                        <SetupStep n={4} mock={<MockAnswer variant="chatgpt" />}>
                            {t.rich('chatgpt.step4', {b})}
                        </SetupStep>
                    </ol>
                    <div className="flex flex-col gap-1">
                        <p className="text-sm text-muted-foreground">
                            {t.rich('chatgpt.note', {
                                link: chunks => <a href={OPENAI_DEV_MODE_HELP} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{chunks}</a>,
                            })}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('illustration')}</p>
                    </div>
                </TabsContent>

                <TabsContent value="developers" className="flex flex-col gap-8">
                    <p className="text-muted-foreground">{t('developers.intro')}</p>
                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline"><a href={cursorLink}>{t('developers.installCursor')}</a></Button>
                        <Button asChild variant="outline"><a href={vscodeLink}>{t('developers.installVscode')}</a></Button>
                    </div>
                    <Snippet title="Claude Code" code={`claude mcp add --transport http zegraph ${mcpUrl}`} />
                    <Snippet
                        title={t('developers.otherClients')}
                        hint={t('developers.otherClientsHint')}
                        code={JSON.stringify({mcpServers: {zegraph: {type: 'http', url: mcpUrl}}}, null, 2)}
                    />
                    <Snippet
                        title={t('developers.inspect')}
                        hint={t('developers.inspectHint')}
                        code={`npx @modelcontextprotocol/inspector --cli ${mcpUrl} --transport http --method tools/list`}
                    />
                    <p className="text-sm text-muted-foreground">
                        {t.rich('apiDocsHint', {
                            link: chunks => <a href="/data/api/ui" className="text-primary underline underline-offset-4">{chunks}</a>,
                        })}
                    </p>
                </TabsContent>
            </Tabs>

            {tab !== 'developers' && (
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <MessageSquareText className="size-5 text-primary" />
                        <h2 className="text-xl font-semibold">{t('examples.title')}</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">{t('examples.hint')}</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {EXAMPLES.map(key => (
                            <li key={key} className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
                                <span className="flex-1">{t(`examples.${key}`)}</span>
                                <CopyButton text={t(`examples.${key}`)} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                {t('privacy')}
            </p>
        </div>
    );
}
