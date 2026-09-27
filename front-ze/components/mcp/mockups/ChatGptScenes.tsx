'use client';

import {useTranslations} from 'next-intl';
import {AtSign, Check, ChevronDown, Plus, X} from 'lucide-react';
import {cn} from 'components/lib/utils';
import {MockButton, MockFrame, MockInput, MockScene, MockToggle, spot, TypeIn} from './primitives';

const DEV_MODE = [900, 1100, 1000, 2600] as const;
const SETTINGS_NAV = ['general', 'notifications', 'personalization', 'plugins', 'dataControls', 'security'] as const;

/** Settings → Plugins → Developer mode switched on. */
export function ChatGptDevMode() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('chatgptDevModeLabel')}
            durations={DEV_MODE}
            cursor={phase => [
                {target: 'nav-plugins'},
                {target: 'nav-plugins', click: true},
                {target: 'devmode'},
                {target: 'devmode', click: true},
            ][phase]}
        >
            {phase => (
                <MockFrame variant="chatgpt" address="chatgpt.com/#settings" bodyClassName="min-h-64">
                    <ChatGptHome />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-3">
                        <div className="mock-pop flex w-full max-w-96 overflow-hidden rounded-2xl border border-(--m-border) bg-(--m-bg) shadow-xl">
                            <div className="w-24 shrink-0 space-y-0.5 bg-(--m-panel) p-1.5 sm:w-28">
                                <X className="mb-1 ml-1 size-3.5 text-(--m-muted)" />
                                {SETTINGS_NAV.map(key => (
                                    <div
                                        key={key}
                                        data-mock={`nav-${key}`}
                                        className={cn(
                                            'truncate rounded-md px-1.5 py-1',
                                            key === (phase === 0 ? 'general' : 'plugins') && 'bg-(--m-border) font-medium',
                                        )}
                                    >
                                        {t(key)}
                                    </div>
                                ))}
                            </div>
                            <div className="min-w-0 flex-1 p-3">
                                {phase === 0 ? (
                                    <div className="space-y-2">
                                        <div className="border-b border-(--m-border) pb-1.5 font-medium">{t('general')}</div>
                                        <SettingRow label={t('theme')} value={t('system')} />
                                        <SettingRow label={t('language')} value={t('auto')} />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="border-b border-(--m-border) pb-1.5 font-medium">{t('plugins')}</div>
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
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </MockFrame>
            )}
        </MockScene>
    );
}

const NEW_PLUGIN = [800, 1000, 1800, 1000, 900, 1000, 2600] as const;

/** Plugins → "+" → New Plugin, filled in with the URL and "No authentication". */
export function ChatGptNewPlugin({mcpUrl}: { mcpUrl: string }) {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('chatgptNewPluginLabel')}
            durations={NEW_PLUGIN}
            cursor={phase => [
                {target: 'name'},
                {target: 'name'},
                {target: 'url'},
                {target: 'auth', click: true},
                {target: 'noauth', click: true},
                {target: 'risk', click: true},
                {target: 'create'},
            ][phase]}
        >
            {phase => (
                <MockFrame variant="chatgpt" address="chatgpt.com/plugins" bodyClassName="min-h-84">
                    <ChatGptHome />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-3">
                        <div className="mock-pop w-full max-w-72 space-y-2 rounded-2xl border border-(--m-border) bg-(--m-bg) p-3 shadow-xl">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold">{t('chatgptNewPlugin')}</span>
                                <X className="size-3.5 text-(--m-muted)" />
                            </div>
                            <Field label={t('name')}>
                                <MockInput data-mock="name" active={phase === 1}>
                                    <TypeIn text="ZE Graph" state={phase === 0 ? 'empty' : phase === 1 ? 'typing' : 'done'} ms={800} />
                                </MockInput>
                            </Field>
                            <Field label={t('chatgptConnection')}>
                                <Select value={t('chatgptServerUrl')} />
                            </Field>
                            <Field label={t('chatgptServerUrl')}>
                                <MockInput data-mock="url" active={phase === 2}>
                                    <TypeIn
                                        text={mcpUrl}
                                        placeholder="https://"
                                        state={phase < 2 ? 'empty' : phase === 2 ? 'typing' : 'done'}
                                        ms={1400}
                                    />
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
                        </div>
                    </div>
                </MockFrame>
            )}
        </MockScene>
    );
}

const CHAT_PICK = [900, 1000, 2600] as const;

/** Typing "@" in a chat and picking ZE Graph. */
export function ChatGptChatPick() {
    const t = useTranslations('mcp.mock');
    return (
        <MockScene
            label={t('chatgptChatPickLabel')}
            durations={CHAT_PICK}
            cursor={phase => [
                {target: 'composer', click: true},
                {target: 'composer'},
                {target: 'pick-zegraph', click: true},
            ][phase]}
        >
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

function ChatGptHome() {
    const t = useTranslations('mcp.mock');
    return (
        <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 opacity-60">
            <div className="text-base font-medium">{t('chatgptGreeting')}</div>
            <div className="h-8 w-full max-w-xs rounded-full border border-(--m-border) bg-(--m-surface)" />
        </div>
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

function Field({label, children}: { label: string, children: React.ReactNode }) {
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
