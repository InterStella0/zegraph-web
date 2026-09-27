import {ReactNode} from 'react';
import {getLocale, getTranslations} from 'next-intl/server';
import {ChevronRight, Map as MapIcon, Server, User, Wrench} from 'lucide-react';
import {Badge} from 'components/ui/badge';
import {BACKEND_DOMAIN} from 'utils/generalUtils';

type ArgumentSchema = {
    type?: string,
    format?: string,
    enum?: string[],
    description?: string,
};

type McpTool = {
    name: string,
    description: string,
    inputSchema: { properties?: Record<string, ArgumentSchema>, required?: string[] },
    annotations?: { title?: string },
};

const GROUPS = [
    {key: 'servers', icon: Server},
    {key: 'players', icon: User},
    {key: 'maps', icon: MapIcon},
] as const;
type Group = typeof GROUPS[number]['key'];

function groupOf(name: string): Group {
    if (/^(get_player_|search_players)/.test(name)) return 'players';
    if (/^(get_map_|list_maps|search_maps)/.test(name)) return 'maps';
    return 'servers';
}

/**
 * The live `tools/list` from the backend, so this page shows exactly the titles and descriptions
 * in `src/mcp/tool_docs.json` that assistants are given. Null when the backend can't be reached,
 * including during the production build.
 */
async function getTools(): Promise<McpTool[] | null> {
    if (process.env.NEXT_PHASE === 'phase-production-build') return null;
    try {
        const response = await fetch(`${BACKEND_DOMAIN}/mcp`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Accept: 'application/json'},
            body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}),
            next: {revalidate: 3600},
        });
        if (!response.ok) return null;
        const json = await response.json();
        return Array.isArray(json?.result?.tools) ? json.result.tools : null;
    } catch {
        return null;
    }
}

/** Renders `code` spans, and turns mentions of other tools into links to their entries. */
function formatText(text: string, toolNames: Set<string>): ReactNode[] {
    return text.split(/(`[^`]+`|\b[a-z]+(?:_[a-z]+)+\b)/).map((part, index) => {
        const quoted = part.startsWith('`') && part.endsWith('`') && part.length > 1;
        const word = quoted ? part.slice(1, -1) : part;
        if (toolNames.has(word)) {
            return (
                <a key={index} href={`#${word}`} className="font-mono text-[0.9em] text-primary underline-offset-4 hover:underline">
                    {word}
                </a>
            );
        }
        if (quoted) {
            return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{word}</code>;
        }
        return part;
    });
}

function typeLabel(schema: ArgumentSchema): string {
    if (schema.enum?.length) return schema.enum.join(' | ');
    return schema.format ?? schema.type ?? 'string';
}

async function ToolCard({tool, toolNames}: { tool: McpTool, toolNames: Set<string> }) {
    const t = await getTranslations('mcp.tools');
    const required = new Set(tool.inputSchema.required ?? []);
    const args = Object.entries(tool.inputSchema.properties ?? {})
        .sort(([a], [b]) => Number(required.has(b)) - Number(required.has(a)));

    return (
        <article id={tool.name} className="scroll-mt-24 space-y-2 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h4 className="font-semibold">{tool.annotations?.title ?? tool.name}</h4>
                <code className="font-mono text-xs text-muted-foreground">{tool.name}</code>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{formatText(tool.description, toolNames)}</p>
            {args.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('noArguments')}</p>
            ) : (
                <details className="group text-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                        {t('arguments', {count: args.length})}
                    </summary>
                    <dl className="mt-2 space-y-2 border-l pl-3">
                        {args.map(([name, schema]) => (
                            <div key={name} className="space-y-0.5">
                                <dt className="flex flex-wrap items-center gap-2">
                                    <code className="font-mono text-xs font-semibold">{name}</code>
                                    <span className="font-mono text-xs text-muted-foreground">{typeLabel(schema)}</span>
                                    {required.has(name) && <Badge variant="secondary">{t('required')}</Badge>}
                                </dt>
                                {schema.description && (
                                    <dd className="text-xs leading-relaxed text-muted-foreground">
                                        {formatText(schema.description, toolNames)}
                                    </dd>
                                )}
                            </div>
                        ))}
                    </dl>
                </details>
            )}
        </article>
    );
}

export default async function McpToolList() {
    const [t, locale, tools] = await Promise.all([getTranslations('mcp.tools'), getLocale(), getTools()]);
    const toolNames = new Set(tools?.map(tool => tool.name));

    return (
        <section id="tools" className="scroll-mt-24 space-y-6">
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Wrench className="size-5 text-primary" />
                    <h2 className="text-xl font-semibold">{t('title')}</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    {tools ? t('intro', {count: tools.length}) : t('unavailable')}
                </p>
                {tools && locale !== 'en' && <p className="text-xs text-muted-foreground">{t('englishOnly')}</p>}
            </div>

            {tools && GROUPS.map(({key, icon: Icon}) => {
                const members = tools.filter(tool => groupOf(tool.name) === key);
                if (members.length === 0) return null;
                return (
                    <div key={key} className="space-y-3">
                        <h3 className="flex items-center gap-2 font-semibold">
                            <Icon className="size-4 text-muted-foreground" />
                            {t(`groups.${key}`)}
                            <span className="text-sm font-normal text-muted-foreground">{members.length}</span>
                        </h3>
                        <div className="grid gap-3 md:grid-cols-2">
                            {members.map(tool => <ToolCard key={tool.name} tool={tool} toolNames={toolNames} />)}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}
