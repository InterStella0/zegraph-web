'use client';

import {useTranslations} from 'next-intl';
import {Check, Loader2} from 'lucide-react';
import {cn} from 'components/lib/utils';
import {MockFrame, MockScene, MockVariant} from './primitives';

const ANSWER = [700, 1500, 3400] as const;

// Recognizable ZE communities; the player counts are illustrative rather than live data.
const ROWS = [
    ['GFL', '62/64'],
    ['Mapeadores', '57/64'],
    ['Nide', '41/64'],
] as const;

/** What success looks like: the assistant answering a question with ZE Graph data. */
export function MockAnswer({variant}: { variant: MockVariant }) {
    const t = useTranslations('mcp.mock');
    const claude = variant === 'claude';
    return (
        <MockScene label={t('answerLabel')} durations={ANSWER}>
            {phase => (
                <MockFrame variant={variant} address={claude ? 'claude.ai/chat' : 'chatgpt.com/c'}>
                    <div className={cn('h-full min-h-60', claude && 'bg-(--m-panel)')}>
                        <div className="mx-auto flex w-full max-w-md flex-col gap-2.5 p-3">
                            <div className={cn(
                                'max-w-[85%] self-end rounded-2xl px-3 py-1.5',
                                claude ? 'bg-(--m-hover)' : 'bg-(--m-panel)',
                            )}>
                                {t('answerQuestion')}
                            </div>
                            {phase >= 1 && (
                                <div className="mock-pop flex w-fit items-center gap-1.5 rounded-lg border border-(--m-border) px-2 py-1 text-(--m-muted)">
                                    {phase === 1
                                        ? <Loader2 className="size-3 animate-spin" />
                                        : <Check className="size-3 text-(--m-accent)" />}
                                    {t('usedTool')}
                                </div>
                            )}
                            {phase === 2 && (
                                <div className="mock-pop space-y-1.5">
                                    <p>{t('answerIntro')}</p>
                                    <div className="overflow-hidden rounded-lg border border-(--m-border)">
                                        {ROWS.map(([name, players], i) => (
                                            <div
                                                key={name}
                                                className={cn('flex justify-between px-2 py-1', i > 0 && 'border-t border-(--m-border)')}
                                            >
                                                <span>{i + 1}. {name}</span>
                                                <span className="tabular-nums text-(--m-muted)">{players}</span>
                                            </div>
                                        ))}
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
