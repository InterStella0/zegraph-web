'use client';

import {ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {AtSign, Check, ChevronDown, Plus, X} from 'lucide-react';
import {cn} from 'components/lib/utils';
import {MockButton, MockFrame, MockInput, MockPhase, MockScene, MockToggle, spot, TypeIn} from './primitives';

const DEV_MODE: MockPhase[] = [[900, 'nav-plugins'], [1100, 'nav-plugins', 'click'], [1000, 'devmode'], [2600, 'devmode', 'click']];
const SETTINGS_NAV = ['general', 'notifications', 'personalization', 'plugins', 'dataControls', 'security'] as const;

export function ChatGptDevMode() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene label={t('chatgptDevModeLabel')} phases={DEV_MODE}>
            {phase => {
                const page = phase === 0 ? 'general' : 'plugins';
                return (
                    <ChatGptDialog address="chatgpt.com/#settings" bodyClassName="min-h-64" className="flex max-w-96 overflow-hidden">
                        <div className="w-24 shrink-0 space-y-0.5 bg-(--m-panel) p-1.5 sm:w-28">
                            <X className="mb-1 ml-1 size-3.5 text-(--m-muted)" />
                            {SETTINGS_NAV.map(key => (
                                <div
                                    key={key}
                                    data-mock={`nav-${key}`}
                                    className={cn('truncate rounded-md px-1.5 py-1', key === page && 'bg-(--m-border) font-medium')}
                                >
                                    {t(key)}
                                </div>
                            ))}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2 p-3">
                            <div className="border-b border-(--m-border) pb-1.5 font-medium">{t(page)}</div>
                            {phase === 0 ? (
                                <>
                                    <SettingRow label={t('theme')} value={t('system')} />
                                    <SettingRow label={t('language')} value={t('auto')} />
                                </>
                            ) : (
                                <>
                                    <SettingRow label="Google Drive" value={t('connected')} />
                                    <SettingRow label="GitHub" value={t('connected')} />
                                    <div
                                        data-mock="devmode"
                                        className={cn('flex items-center gap-2 rounded-md p-1 -mx-1', spot(phase === 3))}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium">{t('developerMode')}</div>
                                            <div className="truncate text-[10px] text-(--m-muted)">{t('developerModeHint')}</div>
                                        </div>
                                        <MockToggle on={phase === 3} />
                                    </div>
                                </>
                            )}
                        </div>
                    </ChatGptDialog>
                );
            }}
        </MockScene>
    );
}

const NEW_PLUGIN: MockPhase[] = [
    [800, 'name'],
    [1000, 'name'],
    [1800, 'url'],
    [1000, 'auth', 'click'],
    [900, 'noauth', 'click'],
    [1000, 'risk', 'click'],
    [2600, 'create'],
];

export function ChatGptNewPlugin({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene label={t('chatgptNewPluginLabel')} phases={NEW_PLUGIN}>
            {phase => (
                <ChatGptDialog address="chatgpt.com/plugins" bodyClassName="min-h-84" className="max-w-72 space-y-2 p-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{t('chatgptNewPlugin')}</span>
                        <X className="size-3.5 text-(--m-muted)" />
                    </div>
                    <Field label={t('name')}>
                        <MockInput data-mock="name" active={phase === 1}>
                            <TypeIn text="ZE Graph" phase={phase} at={1} ms={800} />
                        </MockInput>
                    </Field>
                    <Field label={t('chatgptConnection')}>
                        <Select value={t('chatgptServerUrl')} />
                    </Field>
                    <Field label={t('chatgptServerUrl')}>
                        <MockInput data-mock="url" active={phase === 2}>
                            <TypeIn text={mcpUrl} placeholder="https://" phase={phase} at={2} ms={1400} />
                        </MockInput>
                    </Field>
                    <Field label={t('authentication')}>
                        <div className="relative">
                            <div data-mock="auth">
                                <Select value={phase >= 4 ? t('noAuthentication') : 'OAuth'} active={phase === 3} />
                            </div>
                            {phase === 3 && (
                                <div className="mock-pop absolute left-0 right-0 top-full z-10 mt-1 space-y-0.5 rounded-lg border border-(--m-border) bg-(--m-surface) p-1 shadow-lg">
                                    <div className="rounded px-2 py-1">OAuth</div>
                                    <div data-mock="noauth" className="rounded bg-(--m-panel) px-2 py-1 font-medium">{t('noAuthentication')}</div>
                                </div>
                            )}
                        </div>
                    </Field>
                    <div data-mock="risk" className="flex items-start gap-1.5 text-[10px] leading-tight">
                        <span className={cn(
                            'mt-px inline-flex size-3 shrink-0 items-center justify-center rounded-sm border',
                            phase >= 5 ? 'border-(--m-primary) bg-(--m-primary) text-(--m-primary-fg)' : 'border-(--m-muted)',
                        )}>
                            {phase >= 5 && <Check className="size-2.5" strokeWidth={3} />}
                        </span>
                        <span className="text-(--m-muted)">{t('chatgptRisk')}</span>
                    </div>
                    <div className="flex justify-end gap-1.5 pt-0.5">
                        <MockButton className="rounded-full">{t('cancel')}</MockButton>
                        <MockButton data-mock="create" primary className={cn('rounded-full', spot(phase === 6))}>
                            {t('create')}
                        </MockButton>
                    </div>
                </ChatGptDialog>
            )}
        </MockScene>
    );
}

const CHAT_PICK: MockPhase[] = [[900, 'composer', 'click'], [1000, 'composer'], [2600, 'pick-zegraph', 'click']];

export function ChatGptChatPick() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene label={t('chatgptChatPickLabel')} phases={CHAT_PICK}>
            {phase => (
                <MockFrame variant="chatgpt" address="chatgpt.com">
                    <div className="flex h-full min-h-60 flex-col items-center justify-end gap-3 p-3 pb-6">
                        <div className="mb-auto mt-6 text-base font-medium">{t('chatgptGreeting')}</div>
                        <div className="relative w-full max-w-md">
                            {phase >= 1 && (
                                <div className="mock-pop absolute bottom-full left-2 z-10 mb-1 w-44 space-y-0.5 rounded-xl border border-(--m-border) bg-(--m-surface) p-1 shadow-lg">
                                    <div className="px-2 py-0.5 text-[10px] text-(--m-muted)">{t('plugins')}</div>
                                    <div data-mock="pick-zegraph" className={cn('flex items-center gap-1.5 rounded-md bg-(--m-panel) px-2 py-1 font-medium', spot(phase === 2))}>
                                        <span className="size-3.5 rounded bg-(--m-ring)" /> ZE Graph
                                    </div>
                                    <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
                                        <span className="size-3.5 rounded bg-(--m-border)" /> Google Drive
                                    </div>
                                </div>
                            )}
                            <div data-mock="composer" className="flex items-center gap-2 rounded-full border border-(--m-border) bg-(--m-surface) px-2.5 py-2 shadow-sm">
                                <Plus className="size-3.5 text-(--m-muted)" />
                                <span className="flex-1">
                                    {phase === 0
                                        ? <span className="text-(--m-muted)">{t('chatgptComposer')}</span>
                                        : <span>@<span className="mock-caret" /></span>}
                                </span>
                                <AtSign className="size-3.5 text-(--m-muted)" />
                            </div>
                        </div>
                    </div>
                </MockFrame>
            )}
        </MockScene>
    );
}

/** A dialog popped over a faded ChatGPT home screen. */
function ChatGptDialog({address, bodyClassName, className, children}: {
    address: string,
    bodyClassName: string,
    className: string,
    children: ReactNode,
}) {
    const t = useTranslations('mcp.mock');
    return (
        <MockFrame variant="chatgpt" address={address} bodyClassName={bodyClassName}>
            <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 opacity-60">
                <div className="text-base font-medium">{t('chatgptGreeting')}</div>
                <div className="h-8 w-full max-w-xs rounded-full border border-(--m-border) bg-(--m-surface)" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-3">
                <div className={cn('mock-pop w-full rounded-2xl border border-(--m-border) bg-(--m-bg) shadow-xl', className)}>
                    {children}
                </div>
            </div>
        </MockFrame>
    );
}

function SettingRow({label, value}: { label: string, value: string }) {
    return (
        <div className="flex items-center justify-between gap-2 border-b border-(--m-border) pb-1.5">
            <span className="truncate">{label}</span>
            <span className="shrink-0 text-(--m-muted)">{value}</span>
        </div>
    );
}

function Field({label, children}: { label: string, children: ReactNode }) {
    return (
        <div className="space-y-0.5">
            <div className="text-[10px] font-medium text-(--m-muted)">{label}</div>
            {children}
        </div>
    );
}

function Select({value, active}: { value: string, active?: boolean }) {
    return (
        <MockInput active={active} className="flex items-center justify-between">
            <span className="truncate">{value}</span>
            <ChevronDown className="size-3 shrink-0 text-(--m-muted)" />
        </MockInput>
    );
}
