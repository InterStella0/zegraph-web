'use client';

import {useTranslations} from 'next-intl';
import {ChevronDown, Plus, X} from 'lucide-react';
import {cn} from 'components/lib/utils';
import {MockButton, MockFrame, MockInput, MockScene, spot, TypeIn} from './primitives';

const ADD_CONNECTOR = [900, 1500, 2400, 1100, 2600] as const;

/** Customize → Connectors → "+" → Add custom connector, with the name and URL filled in. */
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
                                <MockButton data-mock="add" primary className={cn('rounded-md', spot(phase >= 3))}>
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
