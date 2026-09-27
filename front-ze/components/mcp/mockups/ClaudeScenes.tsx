'use client';

import {useTranslations} from 'next-intl';
import {ChevronDown, ChevronRight, Paperclip, Plug, Plus, Search, X} from 'lucide-react';
import {cn} from 'components/lib/utils';
import {MockButton, MockFrame, MockInput, MockScene, MockToggle, spot, TypeIn} from './primitives';

const OPEN_CONNECTORS = [900, 1100, 1200, 2600] as const;

/** Customize → Connectors → "+" menu with "Add custom connector". */
export function ClaudeOpenConnectors() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('claudeOpenConnectorsLabel')}
            durations={OPEN_CONNECTORS}
            cursor={phase => [
                {target: 'nav-connectors'},
                {target: 'nav-connectors', click: true},
                {target: 'plus', click: true},
                {target: 'add-custom'},
            ][phase]}
        >
            {phase => (
                <MockFrame
                    variant="claude"
                    address={phase === 0 ? 'claude.ai/customize' : 'claude.ai/customize/connectors'}
                    sidebar={<ClaudeCustomizeNav active={phase === 0 ? 'skills' : 'connectors'} />}
                >
                    {phase === 0 ? (
                        <div className="space-y-2 p-3">
                            <span className="font-(family-name:--m-display) text-sm">{t('skills')}</span>
                            {[0, 1, 2].map(i => <div key={i} className="h-7 rounded-lg border border-(--m-border) bg-(--m-surface)" />)}
                        </div>
                    ) : (
                        <ClaudeConnectorsPage highlightPlus={phase === 2} />
                    )}
                    {phase >= 2 && (
                        <div className="mock-pop absolute right-3 top-10 z-10 w-44 space-y-0.5 rounded-lg border border-(--m-border) bg-(--m-surface) p-1 shadow-lg">
                            <div className="rounded px-2 py-1 text-(--m-muted)">{t('claudeBrowseConnectors')}</div>
                            <div data-mock="add-custom" className={cn('rounded bg-(--m-panel) px-2 py-1 font-medium', spot(phase === 3))}>
                                {t('claudeAddCustomConnector')}
                            </div>
                        </div>
                    )}
                </MockFrame>
            )}
        </MockScene>
    );
}

const ADD_CONNECTOR = [900, 1500, 2400, 1100, 2600] as const;

/** The "Add custom connector" dialog with the name and URL filled in. */
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
                {target: 'add'},
                {target: 'add', click: true},
            ][phase]}
        >
            {phase => (
                <MockFrame variant="claude" address="claude.ai/customize/connectors" sidebar={<ClaudeCustomizeNav />}>
                    <ClaudeConnectorsPage />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-3">
                        <div className="mock-pop w-full max-w-72 space-y-2.5 rounded-xl border border-(--m-border) bg-(--m-bg) p-3 shadow-xl">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-(family-name:--m-display) text-sm">{t('claudeAddCustomConnector')}</span>
                                    <span className="rounded bg-(--m-panel) px-1 text-[9px] uppercase text-(--m-muted)">Beta</span>
                                </div>
                                <X className="size-3.5 text-(--m-muted)" />
                            </div>
                            <MockInput data-mock="name" active={phase === 1}>
                                <TypeIn
                                    text="ZE Graph"
                                    placeholder={t('name')}
                                    state={phase === 0 ? 'empty' : phase === 1 ? 'typing' : 'done'}
                                    ms={900}
                                />
                            </MockInput>
                            <MockInput data-mock="url" active={phase === 2}>
                                <TypeIn
                                    text={mcpUrl}
                                    placeholder={t('claudeRemoteUrl')}
                                    state={phase < 2 ? 'empty' : phase === 2 ? 'typing' : 'done'}
                                    ms={1700}
                                />
                            </MockInput>
                            <div className="flex items-center gap-1 text-(--m-muted)">
                                <ChevronDown className="size-3" /> {t('advancedSettings')}
                            </div>
                            <div className="flex justify-end gap-1.5 pt-1">
                                <MockButton>{t('cancel')}</MockButton>
                                <MockButton data-mock="add" primary className={spot(phase >= 3)}>
                                    {t('add')}
                                </MockButton>
                            </div>
                        </div>
                    </div>
                </MockFrame>
            )}
        </MockScene>
    );
}

const CHAT_TOOLS = [900, 1100, 1100, 2600] as const;

/** Chat composer → "+" → Connectors → ZE Graph switched on. */
export function ClaudeChatTools() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('claudeChatToolsLabel')}
            durations={CHAT_TOOLS}
            cursor={phase => [
                {target: 'composer-plus'},
                {target: 'menu-connectors', click: false},
                {target: 'zegraph-toggle'},
                {target: 'zegraph-toggle', click: true},
            ][phase]}
        >
            {phase => (
                <MockFrame variant="claude" address="claude.ai/new">
                    <div className="flex h-full min-h-60 flex-col items-center justify-end gap-3 p-3">
                        <div className="mb-auto mt-6 font-(family-name:--m-display) text-base">{t('claudeGreeting')}</div>
                        <div className="relative w-full max-w-md rounded-xl border border-(--m-border) bg-(--m-surface) p-2 shadow-sm">
                            <div className="px-1 pb-2 text-(--m-muted)">{t('claudeComposer')}</div>
                            <span
                                data-mock="composer-plus"
                                className={cn('inline-flex rounded-md border border-(--m-border) p-1', spot(phase === 0))}
                            >
                                <Plus className="size-3" />
                            </span>
                            {phase >= 1 && (
                                <div className="mock-pop absolute bottom-10 left-1 z-10 w-40 space-y-0.5 rounded-lg border border-(--m-border) bg-(--m-surface) p-1 shadow-lg">
                                    <MenuRow icon={<Paperclip className="size-3" />}>{t('claudeAddFiles')}</MenuRow>
                                    <MenuRow icon={<Search className="size-3" />}>{t('claudeResearch')}</MenuRow>
                                    <div data-mock="menu-connectors">
                                        <MenuRow icon={<Plug className="size-3" />} active={phase >= 1} trailing={<ChevronRight className="size-3" />}>
                                            {t('connectors')}
                                        </MenuRow>
                                    </div>
                                </div>
                            )}
                            {phase >= 1 && (
                                <div className="mock-pop absolute bottom-3 left-42 z-10 w-36 space-y-0.5 rounded-lg border border-(--m-border) bg-(--m-surface) p-1 shadow-lg max-[420px]:left-20 max-[420px]:bottom-24">
                                    <MenuRow trailing={<MockToggle on />}>Google Drive</MenuRow>
                                    <div data-mock="zegraph-toggle" className={cn('rounded', spot(phase === 3))}>
                                        <MenuRow trailing={<MockToggle on={phase === 3} />} active>ZE Graph</MenuRow>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </MockFrame>
            )}
        </MockScene>
    );
}

function MenuRow({icon, trailing, active, children}: {
    icon?: React.ReactNode,
    trailing?: React.ReactNode,
    active?: boolean,
    children: React.ReactNode,
}) {
    return (
        <div className={cn('flex items-center gap-1.5 rounded px-2 py-1', active && 'bg-(--m-panel)')}>
            {icon && <span className="text-(--m-muted)">{icon}</span>}
            <span className="flex-1 truncate">{children}</span>
            {trailing}
        </div>
    );
}

function ClaudeCustomizeNav({active = 'connectors'}: { active?: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <div className="space-y-0.5">
            <div className="px-1.5 pb-1.5 font-(family-name:--m-display) text-[13px]">{t('claudeCustomize')}</div>
            {(['skills', 'connectors'] as const).map(key => (
                <div
                    key={key}
                    data-mock={`nav-${key}`}
                    className={cn('rounded-md px-1.5 py-1', key === active && 'bg-(--m-border)/70 font-medium')}
                >
                    {t(key)}
                </div>
            ))}
        </div>
    );
}

function ClaudeConnectorsPage({highlightPlus = false}: { highlightPlus?: boolean }) {
    const t = useTranslations('mcp.mock');
    return (
        <div className="space-y-2 p-3">
            <div className="flex items-center justify-between">
                <span className="font-(family-name:--m-display) text-sm">{t('connectors')}</span>
                <span data-mock="plus" className={cn('rounded-md border border-(--m-border) bg-(--m-surface) p-1', spot(highlightPlus))}>
                    <Plus className="size-3" />
                </span>
            </div>
            {['Google Drive', 'GitHub'].map(name => (
                <div key={name} className="flex items-center gap-2 rounded-lg border border-(--m-border) bg-(--m-surface) px-2 py-1.5">
                    <span className="size-4 rounded bg-(--m-panel)" />
                    <span>{name}</span>
                </div>
            ))}
        </div>
    );
}
