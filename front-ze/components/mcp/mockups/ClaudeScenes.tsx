'use client';

import {ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {
    ArrowLeft, Ban, Blocks, BriefcaseBusiness, Check, ChevronDown, ChevronRight, CircleCheck, CircleUser, Copy,
    EllipsisVertical, Hand, Info, Mic, Paperclip, Plug, Plus, ScrollText, Search, Settings, Shield,
    SlidersHorizontal, Telescope, TriangleAlert, X,
} from 'lucide-react';
import {cn} from 'components/lib/utils';
import {MockFrame, MockScene, MockToggle, spot, TypeIn} from './primitives';

// The Claude scenes follow the real settings modal: a Settings / Customize sidebar, a Connectors
// table, a two-page "Add custom connector" dialog, then the connector's own page.

const OPEN_CONNECTORS = [900, 1100, 1200, 2600] as const;

/** Settings → Connectors → "Add" menu with "Add custom connector". */
export function ClaudeOpenConnectors() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('claudeOpenConnectorsLabel')}
            durations={OPEN_CONNECTORS}
            cursor={phase => [
                {target: 'nav-connectors'},
                {target: 'nav-connectors', click: true},
                {target: 'add', click: true},
                {target: 'add-custom'},
            ][phase]}
        >
            {phase => (
                <ClaudeSettings
                    address={phase === 0 ? 'claude.ai/settings/general' : 'claude.ai/settings/connectors'}
                    active={phase === 0 ? 'general' : 'connectors'}
                >
                    {phase === 0 ? (
                        <div className="space-y-2.5 p-3">
                            <div className="text-sm font-semibold">{t('general')}</div>
                            {[0, 1, 2].map(i => (
                                <div key={i} className="flex items-center justify-between border-b border-(--m-border) pb-2">
                                    <span className="h-2 w-24 rounded-full bg-(--m-hover)" />
                                    <span className="h-4 w-16 rounded-md bg-(--m-field)" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <ClaudeConnectorsPage highlightAdd={phase === 2} />
                    )}
                    {phase >= 2 && (
                        <ClaudeMenu className="right-3 top-10 w-44">
                            <ClaudeMenuRow>{t('claudeBrowseConnectors')}</ClaudeMenuRow>
                            <div data-mock="add-custom" className={cn('rounded-md', spot(phase === 3))}>
                                <ClaudeMenuRow active={phase === 3}>{t('claudeAddCustomConnector')}</ClaudeMenuRow>
                            </div>
                        </ClaudeMenu>
                    )}
                </ClaudeSettings>
            )}
        </MockScene>
    );
}

const ADD_CONNECTOR = [900, 1500, 2400, 1100, 2600] as const;

/** Page one of "Add custom connector": the name and URL filled in, then Continue. */
export function ClaudeAddConnector({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('claudeAddConnectorLabel')}
            durations={ADD_CONNECTOR}
            cursor={phase => [
                {target: 'name'},
                {target: 'name'},
                {target: 'url'},
                {target: 'continue'},
                {target: 'continue', click: true},
            ][phase]}
        >
            {phase => (
                <ClaudeSettings address="claude.ai/settings/connectors" active="connectors">
                    <ClaudeDialog title={t('claudeAddCustomConnector')}>
                        <p className="text-(--m-soft)">
                            {t.rich('claudeConnectorIntro', {
                                link: chunks => <span className="text-(--m-link) underline underline-offset-2">{chunks}</span>,
                            })}
                        </p>
                        <ClaudeField data-mock="name" active={phase === 1} hint={t('claudeNameHint')}>
                            <TypeIn
                                text="ZE Graph"
                                placeholder={t('name')}
                                state={phase === 0 ? 'empty' : phase === 1 ? 'typing' : 'done'}
                                ms={900}
                            />
                        </ClaudeField>
                        <ClaudeField data-mock="url" active={phase === 2} hint={t('claudeServerUrlHint')}>
                            <TypeIn
                                text={mcpUrl}
                                placeholder={t('claudeServerUrl')}
                                state={phase < 2 ? 'empty' : phase === 2 ? 'typing' : 'done'}
                                ms={1700}
                            />
                        </ClaudeField>
                        <ClaudeDialogFooter>
                            <ClaudeButton>{t('cancel')}</ClaudeButton>
                            <ClaudeButton
                                data-mock="continue"
                                primary
                                className={cn('transition-opacity', phase < 3 && 'opacity-45', spot(phase >= 3))}
                            >
                                {t('continue')}
                            </ClaudeButton>
                        </ClaudeDialogFooter>
                    </ClaudeDialog>
                </ClaudeSettings>
            )}
        </MockScene>
    );
}

const AUTH = [1800, 1000, 2600] as const;
const AUTH_OPTIONS = [
    ['claudeSignInNow', 'claudeSignInNowHint'],
    ['claudeSignInLater', 'claudeSignInLaterHint'],
    ['claudeNoSignIn', 'claudeNoSignInHint'],
] as const;

/** Page two of the dialog: Authentication is already on "No sign-in", so it's just Add. */
export function ClaudeAuth({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('claudeAuthLabel')}
            durations={AUTH}
            cursor={phase => [
                {target: 'no-sign-in'},
                {target: 'add'},
                {target: 'add', click: true},
            ][phase]}
        >
            {phase => (
                <ClaudeSettings address="claude.ai/settings/connectors" active="connectors">
                    <ClaudeDialog title={t('claudeAddCustomConnector')}>
                        <div className="space-y-0.5 border-b border-(--m-border) pb-2">
                            <div className="font-semibold">ZE Graph</div>
                            <div className="truncate font-mono text-[10px] text-(--m-muted)">{mcpUrl}</div>
                        </div>
                        <div className="flex items-center gap-1 font-semibold">
                            {t('authentication')} <Info className="size-3 text-(--m-muted)" />
                        </div>
                        <div className="space-y-1.5">
                            {AUTH_OPTIONS.map(([label, hint]) => {
                                const selected = label === 'claudeNoSignIn';
                                return (
                                    <div
                                        key={label}
                                        data-mock={selected ? 'no-sign-in' : undefined}
                                        className={cn('-mx-1 flex gap-2 rounded-md px-1 py-0.5', selected && spot(phase === 0))}
                                    >
                                        <span className={cn(
                                            'mt-0.5 size-3 shrink-0 rounded-full border',
                                            selected ? 'border-[3.5px] border-(--m-link) bg-white' : 'border-(--m-muted)',
                                        )} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                {t(label)}
                                                {selected && (
                                                    <span className="rounded bg-(--m-hover) px-1 text-[9px] text-(--m-soft)">{t('claudeDetected')}</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-(--m-muted)">{t(hint)}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex gap-1.5 rounded-lg border border-(--m-warn-fg)/40 bg-(--m-warn-bg) px-2 py-1.5 text-(--m-warn-fg)">
                            <TriangleAlert className="mt-px size-3 shrink-0" />
                            <span>{t('claudeNoSignInWarning')}</span>
                        </div>
                        <div className="space-y-1.5">
                            <div className="font-semibold">{t('claudeRequestHeaders')}</div>
                            <ClaudeButton className="gap-1"><Plus className="size-3" /> {t('claudeAddHeader')}</ClaudeButton>
                        </div>
                        <ClaudeDialogFooter>
                            <ClaudeButton>{t('back')}</ClaudeButton>
                            <ClaudeButton data-mock="add" primary className={spot(phase >= 1)}>{t('add')}</ClaudeButton>
                        </ClaudeDialogFooter>
                    </ClaudeDialog>
                </ClaudeSettings>
            )}
        </MockScene>
    );
}

const CONNECT = [1100, 900, 1200, 1100, 500, 2600] as const;
// A few of the tool titles the server reports, as Claude lists them under Tool permissions.
const TOOLS = ['Get server stats', 'List servers', 'Search players'] as const;

/** The new connector's page: Connect, then optionally let its read-only tools run without asking. */
export function ClaudeConnect({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('claudeConnectLabel')}
            durations={CONNECT}
            cursor={phase => [
                {target: 'connect'},
                {target: 'connect', click: true},
                {target: 'permission', click: true},
                {target: 'always'},
                {target: 'always', click: true},
                null,
            ][phase]}
        >
            {phase => {
                const always = phase === 5;
                return (
                    <ClaudeSettings address="claude.ai/settings/connectors" active="connectors">
                        <div className="space-y-2.5 p-3">
                            <div className="flex items-center gap-1 text-(--m-soft)">
                                <ArrowLeft className="size-3" /> {t('claudeYourConnectors')}
                            </div>
                            {phase < 2 ? (
                                <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                                    <span className="rounded-xl border border-(--m-border) bg-(--m-surface) p-1.5">
                                        <ZeLogo className="size-6" />
                                    </span>
                                    <span className="flex items-center gap-1 text-[10px] text-(--m-muted)">
                                        {mcpUrl} <Copy className="size-2.5" />
                                    </span>
                                    <span className="text-(--m-muted)">{t('claudeNotConnected', {name: 'ZE Graph'})}</span>
                                    <ClaudeButton data-mock="connect" primary className={cn('mt-1', spot(true))}>
                                        {t('claudeConnect')}
                                    </ClaudeButton>
                                </div>
                            ) : (
                                <div className="mock-pop space-y-2.5">
                                    <div className="flex items-center gap-1.5">
                                        <ZeLogo className="size-4" />
                                        <span className="flex-1 text-sm font-semibold">ZE Graph</span>
                                        <ClaudeButton>{t('claudeDisconnect')}</ClaudeButton>
                                        <EllipsisVertical className="size-3.5 text-(--m-muted)" />
                                    </div>
                                    <div className="-mt-1.5 truncate text-[10px] text-(--m-muted)">{mcpUrl}</div>
                                    <div>
                                        <div className="font-semibold">{t('claudeToolPermissions')}</div>
                                        <div className="text-(--m-muted)">{t('claudeToolPermissionsHint')}</div>
                                    </div>
                                    <div className="relative flex items-center gap-1.5">
                                        <ChevronDown className="size-3 text-(--m-muted)" />
                                        <span>{t('claudeReadOnlyTools')}</span>
                                        <span className="rounded bg-(--m-hover) px-1 text-[9px] text-(--m-soft)">37</span>
                                        <span
                                            data-mock="permission"
                                            className={cn(
                                                'ml-auto inline-flex items-center gap-1 rounded-md bg-(--m-hover) px-2 py-1',
                                                spot(phase === 2 || always),
                                            )}
                                        >
                                            {always ? <CircleCheck className="size-3" /> : <Hand className="size-3" />}
                                            {t(always ? 'claudeAlwaysAllow' : 'claudeNeedsApproval')}
                                            <ChevronDown className="size-3 text-(--m-muted)" />
                                        </span>
                                        {(phase === 3 || phase === 4) && (
                                            <ClaudeMenu className="right-0 top-7 w-40">
                                                <div data-mock="always" className={cn('rounded-md', spot(true))}>
                                                    <ClaudeMenuRow icon={<CircleCheck className="size-3" />} active>
                                                        {t('claudeAlwaysAllow')}
                                                    </ClaudeMenuRow>
                                                </div>
                                                <ClaudeMenuRow
                                                    icon={<Hand className="size-3" />}
                                                    trailing={<Check className="size-3 text-(--m-link)" />}
                                                >
                                                    {t('claudeNeedsApproval')}
                                                </ClaudeMenuRow>
                                                <ClaudeMenuRow icon={<Ban className="size-3" />}>{t('claudeBlocked')}</ClaudeMenuRow>
                                            </ClaudeMenu>
                                        )}
                                    </div>
                                    <div>
                                        {TOOLS.map(tool => (
                                            <div key={tool} className="flex items-center border-b border-(--m-border) py-1.5 pl-4 last:border-0">
                                                <span className="flex-1 truncate">{tool}</span>
                                                <ToolPermission value={always ? 0 : 1} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </ClaudeSettings>
                );
            }}
        </MockScene>
    );
}

/** The per-tool allow / ask / block control; `value` is the index of the selected segment. */
function ToolPermission({value}: { value: number }) {
    return (
        <span className="inline-flex overflow-hidden rounded-md border border-(--m-border)">
            {[CircleCheck, Hand, Ban].map((Icon, i) => (
                <span
                    key={i}
                    className={cn('px-1.5 py-0.5 text-(--m-muted) transition-colors', i === value && 'bg-(--m-hover) text-(--m-text)')}
                >
                    <Icon className="size-3" />
                </span>
            ))}
        </span>
    );
}

const CHAT_TOOLS = [900, 900, 1000, 900, 2600] as const;
const CHAT_CONNECTORS = [['Gmail', false], ['ZE Graph', true], ['Google Drive', false]] as const;

/** Chat composer → "+" → Connectors → ZE Graph switched on. */
export function ClaudeChatTools() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('claudeChatToolsLabel')}
            durations={CHAT_TOOLS}
            cursor={phase => [
                {target: 'composer-plus'},
                {target: 'composer-plus', click: true},
                {target: 'menu-connectors'},
                {target: 'zegraph-toggle'},
                {target: 'zegraph-toggle', click: true},
            ][phase]}
        >
            {phase => (
                <MockFrame variant="claude" address="claude.ai/new">
                    <div className="flex h-full min-h-80 flex-col items-center gap-4 bg-(--m-panel) p-3 pt-7">
                        <div className="flex items-center gap-2 font-(family-name:--m-display) text-lg">
                            <ClaudeSpark className="size-5 text-(--m-accent)" />
                            {t('claudeGreeting')}
                        </div>
                        <div className="relative w-full max-w-md rounded-xl border border-(--m-border) bg-(--m-surface) p-2 shadow-sm">
                            <div className="px-1 pb-3 text-(--m-muted)">{t('claudeComposer')}</div>
                            <div className="flex items-center justify-between">
                                <span
                                    data-mock="composer-plus"
                                    className={cn(
                                        'inline-flex rounded-md border border-(--m-border) p-1',
                                        phase >= 1 && 'bg-(--m-hover)',
                                        spot(phase === 0),
                                    )}
                                >
                                    <Plus className="size-3" />
                                </span>
                                <Mic className="size-3 text-(--m-muted)" />
                            </div>
                            {phase >= 1 && (
                                <ClaudeMenu className="left-1 top-full mt-1 w-40">
                                    <ClaudeMenuRow icon={<Paperclip className="size-3" />}>{t('claudeAddFiles')}</ClaudeMenuRow>
                                    <ClaudeMenuDivider />
                                    <ClaudeMenuRow icon={<ScrollText className="size-3" />} trailing={<ChevronRight className="size-3" />}>
                                        {t('skills')}
                                    </ClaudeMenuRow>
                                    <div data-mock="menu-connectors">
                                        <ClaudeMenuRow
                                            icon={<Blocks className="size-3" />}
                                            trailing={<ChevronRight className="size-3" />}
                                            active={phase >= 2}
                                        >
                                            {t('connectors')}
                                        </ClaudeMenuRow>
                                    </div>
                                    <ClaudeMenuDivider />
                                    <ClaudeMenuRow icon={<Telescope className="size-3" />}>{t('claudeResearch')}</ClaudeMenuRow>
                                </ClaudeMenu>
                            )}
                            {phase >= 2 && (
                                <ClaudeMenu className="left-[10.75rem] top-7 w-40 max-[420px]:left-auto max-[420px]:right-1">
                                    <ClaudeMenuRow icon={<Plus className="size-3" />} trailing={<ChevronRight className="size-3" />}>
                                        {t('claudeAddConnector')}
                                    </ClaudeMenuRow>
                                    <ClaudeMenuRow icon={<BriefcaseBusiness className="size-3" />}>{t('claudeManageConnectors')}</ClaudeMenuRow>
                                    <ClaudeMenuDivider />
                                    {CHAT_CONNECTORS.map(([name, ours]) => (
                                        <div
                                            key={name}
                                            data-mock={ours ? 'zegraph-toggle' : undefined}
                                            className={cn('rounded-md', ours && spot(phase >= 3))}
                                        >
                                            <ClaudeMenuRow
                                                icon={ours ? <ZeLogo className="size-3" /> : <AppTile name={name} />}
                                                trailing={<MockToggle on={!ours || phase === 4} />}
                                            >
                                                {name}
                                            </ClaudeMenuRow>
                                        </div>
                                    ))}
                                    <ClaudeMenuDivider />
                                    <ClaudeMenuRow icon={<Search className="size-3" />} trailing={<ChevronRight className="size-3" />}>
                                        {t('claudeToolAccess')}
                                    </ClaudeMenuRow>
                                </ClaudeMenu>
                            )}
                        </div>
                    </div>
                </MockFrame>
            )}
        </MockScene>
    );
}

const NAV_GROUPS = [
    ['settings', [['general', Settings], ['account', CircleUser], ['privacy', Shield], ['capabilities', BriefcaseBusiness]]],
    ['claudeCustomize', [['skills', ScrollText], ['connectors', Blocks], ['plugins', Plug]]],
] as const;

/** The settings modal: sectioned sidebar on the left, the chosen page on the right. */
function ClaudeSettings({address, active, children}: { address: string, active: string, children: ReactNode }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockFrame
            variant="claude"
            address={address}
            sidebar={
                <div className="space-y-3">
                    {NAV_GROUPS.map(([group, items]) => (
                        <div key={group} className="space-y-0.5">
                            <div className="px-1.5 pb-0.5 text-[10px] text-(--m-muted)">{t(group)}</div>
                            {items.map(([key, Icon]) => (
                                <div
                                    key={key}
                                    data-mock={`nav-${key}`}
                                    className={cn(
                                        'flex items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-(--m-soft)',
                                        key === active && 'bg-(--m-hover) text-(--m-text)',
                                    )}
                                >
                                    <Icon className="size-3 shrink-0" />
                                    {t(key)}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            }
        >
            {children}
        </MockFrame>
    );
}

const CONNECTOR_ROWS = [['GitHub', true], ['Gmail', true], ['Google Drive', false]] as const;

function ClaudeConnectorsPage({highlightAdd = false}: { highlightAdd?: boolean }) {
    const t = useTranslations('mcp.mock');
    return (
        <div className="space-y-2.5 p-3">
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{t('connectors')}</span>
                <span className="flex rounded-md bg-(--m-field) p-0.5 text-[10px]">
                    <span className="rounded bg-(--m-hover) px-1.5 py-0.5">{t('claudeYours')}</span>
                    <span className="px-1.5 py-0.5 text-(--m-muted)">{t('claudeDiscover')}</span>
                </span>
                <span className="ml-auto hidden items-center gap-1 rounded-md border border-(--m-border) bg-(--m-field) px-1.5 py-1 text-(--m-muted) sm:flex">
                    <Search className="size-3" />
                </span>
                <SlidersHorizontal className="hidden size-3.5 text-(--m-soft) sm:block" />
                <span
                    data-mock="add"
                    className={cn(
                        'ml-auto inline-flex items-center gap-1 rounded-md bg-(--m-primary) px-2 py-1 font-medium text-(--m-primary-fg) sm:ml-0',
                        spot(highlightAdd),
                    )}
                >
                    <Plus className="size-3" /> {t('add')} <ChevronDown className="size-3" />
                </span>
            </div>
            <div>
                <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] border-b border-(--m-border) pb-1 text-(--m-soft)">
                    <span>{t('claudeConnectorColumn')}</span>
                    <span>{t('claudeTypeColumn')}</span>
                    <span>{t('claudeStatusColumn')}</span>
                </div>
                {CONNECTOR_ROWS.map(([name, connected]) => (
                    <div key={name} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center border-b border-(--m-border) py-1.5">
                        <span className="flex items-center gap-1.5 truncate font-medium">
                            <AppTile name={name} /> {name}
                        </span>
                        <span className="text-(--m-soft)">{t('claudeWeb')}</span>
                        {connected
                            ? <Check className="size-3 text-(--m-soft)" />
                            : <span className="w-fit rounded-md bg-(--m-hover) px-1.5 py-0.5 text-[10px]">{t('claudeConnect')}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * A dialog over the Connectors page. The dialog stays in flow so the frame grows to fit it; the
 * page behind is absolutely placed and clipped.
 */
function ClaudeDialog({title, children}: { title: string, children: ReactNode }) {
    return (
        <div className="relative flex h-full items-center justify-center overflow-hidden p-3">
            <div className="absolute inset-0"><ClaudeConnectorsPage /></div>
            <div className="absolute inset-0 bg-black/50" />
            <div className="mock-pop relative w-full max-w-80 space-y-2.5 rounded-xl border border-(--m-border) bg-(--m-surface) p-3.5 shadow-xl">
                <div className="flex items-start justify-between">
                    <span className="text-sm font-semibold">{title}</span>
                    <X className="size-3.5 text-(--m-muted)" />
                </div>
                {children}
            </div>
        </div>
    );
}

function ClaudeDialogFooter({children}: { children: ReactNode }) {
    return <div className="flex justify-end gap-1.5 pt-1">{children}</div>;
}

function ClaudeField({children, hint, active, ...rest}: {
    children: ReactNode,
    hint: string,
    active?: boolean,
    'data-mock'?: string,
}) {
    return (
        <div className="space-y-1">
            <div
                {...rest}
                className={cn(
                    'truncate rounded-lg border bg-(--m-field) px-2 py-1.5 transition-colors',
                    active ? 'border-(--m-soft)' : 'border-(--m-border)',
                )}
            >
                {children}
            </div>
            <div className="text-[10px] text-(--m-muted)">{hint}</div>
        </div>
    );
}

function ClaudeButton({children, primary, className, ...rest}: {
    children: ReactNode,
    primary?: boolean,
    className?: string,
    'data-mock'?: string,
}) {
    return (
        <span
            {...rest}
            className={cn(
                'inline-flex items-center justify-center rounded-md px-2.5 py-1 font-medium',
                primary ? 'bg-(--m-primary) text-(--m-primary-fg)' : 'bg-(--m-hover)',
                className,
            )}
        >
            {children}
        </span>
    );
}

function ClaudeMenu({className, children}: { className?: string, children: ReactNode }) {
    return (
        <div className={cn(
            'mock-pop absolute z-10 space-y-0.5 rounded-lg border border-(--m-border) bg-(--m-surface) p-1 shadow-lg',
            className,
        )}>
            {children}
        </div>
    );
}

function ClaudeMenuDivider() {
    return <div className="mx-1 my-1 border-t border-(--m-border)" />;
}

function ClaudeMenuRow({icon, trailing, active, children}: {
    icon?: ReactNode,
    trailing?: ReactNode,
    active?: boolean,
    children: ReactNode,
}) {
    return (
        <div className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-1', active && 'bg-(--m-hover)')}>
            {icon && <span className="flex text-(--m-soft)">{icon}</span>}
            <span className="flex-1 truncate">{children}</span>
            {trailing && <span className="flex text-(--m-muted)">{trailing}</span>}
        </div>
    );
}

const TILE_COLOURS: Record<string, string> = {GitHub: '#6e7681', Gmail: '#ea4335', 'Google Drive': '#1fa463'};

/** Stand-in app icon: a letter tile in the service's colour, not its logo. */
function AppTile({name}: { name: string }) {
    return (
        <span
            className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-[8px] font-bold text-white"
            style={{background: TILE_COLOURS[name] ?? '#888'}}
        >
            {name[0]}
        </span>
    );
}

function ZeLogo({className}: { className?: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/ze-logo.svg" alt="" className={cn('shrink-0 rounded-full', className)} />;
}

/** Claude's starburst mark, drawn as twelve rays. */
function ClaudeSpark({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
            {Array.from({length: 12}, (_, i) => (
                <rect key={i} x="11.1" y="1" width="1.8" height="10" rx="0.9" fill="currentColor" transform={`rotate(${i * 30} 12 12)`} />
            ))}
        </svg>
    );
}
