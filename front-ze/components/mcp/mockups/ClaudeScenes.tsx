'use client';

import {ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {
    ArrowLeft, Ban, Blocks, BriefcaseBusiness, Check, ChevronDown, ChevronRight, CircleCheck, CircleUser, Copy,
    EllipsisVertical, Hand, Info, Mic, Paperclip, Plug, Plus, ScrollText, Search, Settings, Shield,
    SlidersHorizontal, Telescope, TriangleAlert, X,
} from 'lucide-react';
import {cn} from 'components/lib/utils';
import {range} from 'utils/generalUtils';
import {MockBoxProps, MockButton, MockFrame, MockInput, MockPhase, MockScene, MockToggle, spot, TypeIn} from './primitives';

const OPEN_CONNECTORS: MockPhase[] = [
    [900, 'nav-connectors'],
    [1100, 'nav-connectors', 'click'],
    [1200, 'add', 'click'],
    [2600, 'add-custom'],
];

export function ClaudeOpenConnectors() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene label={t('claudeOpenConnectorsLabel')} phases={OPEN_CONNECTORS}>
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
                            <ClaudeMenuRow data-mock="add-custom" active={phase === 3} spotlight={phase === 3}>
                                {t('claudeAddCustomConnector')}
                            </ClaudeMenuRow>
                        </ClaudeMenu>
                    )}
                </ClaudeSettings>
            )}
        </MockScene>
    );
}

const ADD_CONNECTOR: MockPhase[] = [
    [900, 'name'],
    [1500, 'name'],
    [2400, 'url'],
    [1100, 'continue'],
    [2600, 'continue', 'click'],
];

export function ClaudeAddConnector({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene label={t('claudeAddConnectorLabel')} phases={ADD_CONNECTOR}>
            {phase => (
                <ClaudeSettings address="claude.ai/settings/connectors" active="connectors">
                    <ClaudeDialog title={t('claudeAddCustomConnector')}>
                        <p className="text-(--m-soft)">
                            {t.rich('claudeConnectorIntro', {
                                link: chunks => <span className="text-(--m-link) underline underline-offset-2">{chunks}</span>,
                            })}
                        </p>
                        <ClaudeField data-mock="name" active={phase === 1} hint={t('claudeNameHint')}>
                            <TypeIn text="ZE Graph" placeholder={t('name')} phase={phase} at={1} ms={900} />
                        </ClaudeField>
                        <ClaudeField data-mock="url" active={phase === 2} hint={t('claudeServerUrlHint')}>
                            <TypeIn text={mcpUrl} placeholder={t('claudeServerUrl')} phase={phase} at={2} ms={1700} />
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

const AUTH: MockPhase[] = [[500, 'continue-origin'], [1800, 'no-sign-in'], [2600, 'auth-add', 'click']];
const AUTH_OPTIONS = [
    ['claudeSignInNow', 'claudeSignInNowHint'],
    ['claudeSignInLater', 'claudeSignInLaterHint'],
    ['claudeNoSignIn', 'claudeNoSignInHint'],
] as const;

export function ClaudeAuth({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene label={t('claudeAuthLabel')} phases={AUTH}>
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
                                        className={cn('-mx-1 flex gap-2 rounded-md px-1 py-0.5', selected && spot(phase === 1))}
                                    >
                                        <span className={cn(
                                            'mt-0.5 size-3 shrink-0 rounded-full border',
                                            selected ? 'border-[3.5px] border-(--m-link) bg-white' : 'border-(--m-muted)',
                                        )} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                {t(label)}
                                                {selected && <ClaudeCount>{t('claudeDetected')}</ClaudeCount>}
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
                            <ClaudeButton><Plus className="size-3" /> {t('claudeAddHeader')}</ClaudeButton>
                        </div>
                        <ClaudeDialogFooter>
                            <ClaudeButton data-mock="continue-origin" primary className="invisible absolute right-0 top-1">
                                {t('continue')}
                            </ClaudeButton>
                            <ClaudeButton>{t('back')}</ClaudeButton>
                            <ClaudeButton data-mock="auth-add" primary className={spot(phase === 2)}>{t('add')}</ClaudeButton>
                        </ClaudeDialogFooter>
                    </ClaudeDialog>
                </ClaudeSettings>
            )}
        </MockScene>
    );
}

const CONNECT: MockPhase[] = [
    [1100, 'connect'],
    [900, 'connect', 'click'],
    [1200, 'permission', 'click'],
    [1100, 'always'],
    [500, 'always', 'click'],
    [2600],
];
const TOOLS = ['Get server stats', 'List servers', 'Search players'] as const;

export function ClaudeConnect({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene label={t('claudeConnectLabel')} phases={CONNECT}>
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
                                        <ClaudeCount>37</ClaudeCount>
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
                                                <ClaudeMenuRow data-mock="always" icon={<CircleCheck />} active spotlight>
                                                    {t('claudeAlwaysAllow')}
                                                </ClaudeMenuRow>
                                                <ClaudeMenuRow icon={<Hand />} trailing={<Check className="text-(--m-link)" />}>
                                                    {t('claudeNeedsApproval')}
                                                </ClaudeMenuRow>
                                                <ClaudeMenuRow icon={<Ban />}>{t('claudeBlocked')}</ClaudeMenuRow>
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

const CHAT_TOOLS: MockPhase[] = [
    [900, 'composer-plus'],
    [900, 'composer-plus', 'click'],
    [1000, 'menu-connectors'],
    [900, 'zegraph-toggle'],
    [2600, 'zegraph-toggle', 'click'],
];
const CHAT_CONNECTORS = [['Gmail', false], ['ZE Graph', true], ['Google Drive', false]] as const;

export function ClaudeChatTools() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene label={t('claudeChatToolsLabel')} phases={CHAT_TOOLS}>
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
                                    <ClaudeMenuRow icon={<Paperclip />}>{t('claudeAddFiles')}</ClaudeMenuRow>
                                    <ClaudeMenuDivider />
                                    <ClaudeMenuRow icon={<ScrollText />} trailing={<ChevronRight />}>{t('skills')}</ClaudeMenuRow>
                                    <ClaudeMenuRow
                                        data-mock="menu-connectors"
                                        icon={<Blocks />}
                                        trailing={<ChevronRight />}
                                        active={phase >= 2}
                                    >
                                        {t('connectors')}
                                    </ClaudeMenuRow>
                                    <ClaudeMenuDivider />
                                    <ClaudeMenuRow icon={<Telescope />}>{t('claudeResearch')}</ClaudeMenuRow>
                                </ClaudeMenu>
                            )}
                            {phase >= 2 && (
                                <ClaudeMenu className="left-[10.75rem] top-7 w-40 max-[420px]:left-auto max-[420px]:right-1">
                                    <ClaudeMenuRow icon={<Plus />} trailing={<ChevronRight />}>{t('claudeAddConnector')}</ClaudeMenuRow>
                                    <ClaudeMenuRow icon={<BriefcaseBusiness />}>{t('claudeManageConnectors')}</ClaudeMenuRow>
                                    <ClaudeMenuDivider />
                                    {CHAT_CONNECTORS.map(([name, ours]) => (
                                        <ClaudeMenuRow
                                            key={name}
                                            data-mock={ours ? 'zegraph-toggle' : undefined}
                                            spotlight={ours && phase >= 3}
                                            icon={ours ? <ZeLogo className="size-3" /> : <AppTile name={name} />}
                                            trailing={<MockToggle on={!ours || phase === 4} />}
                                        >
                                            {name}
                                        </ClaudeMenuRow>
                                    ))}
                                    <ClaudeMenuDivider />
                                    <ClaudeMenuRow icon={<Search />} trailing={<ChevronRight />}>{t('claudeToolAccess')}</ClaudeMenuRow>
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
const CONNECTOR_GRID = 'grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] border-b border-(--m-border)';

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
                <MockButton data-mock="add" primary className={cn('ml-auto px-2 sm:ml-0', spot(highlightAdd))}>
                    <Plus className="size-3" /> {t('add')} <ChevronDown className="size-3" />
                </MockButton>
            </div>
            <div>
                <div className={cn(CONNECTOR_GRID, 'pb-1 text-(--m-soft)')}>
                    <span>{t('claudeConnectorColumn')}</span>
                    <span>{t('claudeTypeColumn')}</span>
                    <span>{t('claudeStatusColumn')}</span>
                </div>
                {CONNECTOR_ROWS.map(([name, connected]) => (
                    <div key={name} className={cn(CONNECTOR_GRID, 'items-center py-1.5')}>
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
    return <div className="relative flex justify-end gap-1.5 pt-1">{children}</div>;
}

function ClaudeField({hint, active, ...rest}: MockBoxProps & { hint: string, active?: boolean }) {
    return (
        <div className="space-y-1">
            <MockInput {...rest} active={active} className={cn('rounded-lg bg-(--m-field)', active && 'border-(--m-soft)')} />
            <div className="text-[10px] text-(--m-muted)">{hint}</div>
        </div>
    );
}

/** Claude's secondary buttons are borderless and grey. */
function ClaudeButton({primary, className, ...rest}: MockBoxProps & { primary?: boolean }) {
    return <MockButton {...rest} primary={primary} className={cn(!primary && 'border-0 bg-(--m-hover)', className)} />;
}

function ClaudeCount({children}: { children: ReactNode }) {
    return <span className="rounded bg-(--m-hover) px-1 text-[9px] text-(--m-soft)">{children}</span>;
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

function ClaudeMenuRow({icon, trailing, active, spotlight = false, children, ...rest}: {
    icon?: ReactNode,
    trailing?: ReactNode,
    active?: boolean,
    spotlight?: boolean,
    children: ReactNode,
    'data-mock'?: string,
}) {
    return (
        <div {...rest} className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-1', active && 'bg-(--m-hover)', spot(spotlight))}>
            {icon && <span className="flex text-(--m-soft) [&>svg]:size-3">{icon}</span>}
            <span className="flex-1 truncate">{children}</span>
            {trailing && <span className="flex text-(--m-muted) [&>svg]:size-3">{trailing}</span>}
        </div>
    );
}

const TILE_COLOURS: Record<string, string> = {GitHub: '#6e7681', Gmail: '#ea4335', 'Google Drive': '#1fa463'};

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

function ClaudeSpark({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
            {range(12).map(i => (
                <rect key={i} x="11.1" y="1" width="1.8" height="10" rx="0.9" fill="currentColor" transform={`rotate(${i * 30} 12 12)`} />
            ))}
        </svg>
    );
}
