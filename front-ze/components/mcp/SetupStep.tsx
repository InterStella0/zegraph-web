'use client';

import {ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import {Check, Pause, Play} from 'lucide-react';
import {cn} from 'components/lib/utils';
import {Button} from 'components/ui/button';
import {MockPlayback, usePrefersReducedMotion} from './mockups/primitives';

export type SetupGuideStep = {
    title: string,
    instruction: ReactNode,
    action?: ReactNode,
    mock: ReactNode,
};

type Progress = { step: number, duration: number | null, barDone: boolean, sceneDone: boolean };

const fresh = (step: number): Progress => ({step, duration: null, barDone: false, sceneDone: false});

/**
 * Step tabs over one panel holding the selected instruction and its app mockup. The mockups play
 * back to back: a step moves on once its scene has finished and its tab's progress bar has filled,
 * and the last step wraps round to the first. Playback pauses off screen and under reduced motion.
 */
export default function SetupStep({steps}: { steps: SetupGuideStep[] }) {
    const t = useTranslations('mcp');
    const reduced = usePrefersReducedMotion();
    const panelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [progress, setProgress] = useState<Progress>(() => fresh(0));
    const [visible, setVisible] = useState(false);
    const [userPaused, setUserPaused] = useState(false);
    const current = progress.step;
    const step = steps[current];
    const paused = reduced || userPaused || !visible;

    useEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {threshold: 0.4});
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!progress.barDone || !progress.sceneDone) return;
        setProgress(fresh((current + 1) % steps.length));
    }, [progress, current, steps.length]);

    // Keep the active tab in view when the strip scrolls sideways on narrow screens. Only the strip
    // scrolls; scrollIntoView would also drag the page.
    useEffect(() => {
        const list = listRef.current;
        const tab = list?.querySelector<HTMLElement>('[data-state="active"]');
        if (!list || !tab) return;
        list.scrollTo({left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth'});
    }, [current]);

    const onDone = useCallback(
        () => setProgress(p => (p.step === current ? {...p, sceneDone: true} : p)),
        [current],
    );
    const onDuration = useCallback(
        (ms: number) => setProgress(p => (p.step === current ? {...p, duration: ms} : p)),
        [current],
    );
    const playback = useMemo(() => ({paused, onDone, onDuration}), [paused, onDone, onDuration]);

    return (
        <TabsPrimitive.Root
            value={String(current)}
            onValueChange={value => setProgress(fresh(Number(value)))}
            className="overflow-hidden rounded-xl border bg-card"
        >
            <TabsPrimitive.List
                ref={listRef}
                aria-label={t('stepsLabel')}
                className="relative flex overflow-x-auto border-b bg-muted/40 [scrollbar-width:none]"
            >
                {steps.map((s, index) => {
                    const active = index === current;
                    const done = index < current;
                    return (
                        <TabsPrimitive.Trigger
                            key={index}
                            value={String(index)}
                            className={cn(
                                'relative min-w-32 flex-1 border-r px-3.5 py-2.5 text-left transition-colors last:border-r-0',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                                active ? 'bg-card text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                            )}
                        >
                            <span className={cn(
                                'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider',
                                active || done ? 'text-primary' : 'opacity-70',
                            )}>
                                {t('stepN', {n: index + 1})}
                                {done && <Check className="size-3" strokeWidth={3} />}
                            </span>
                            <span className="block truncate text-sm font-medium">{s.title}</span>
                            {active && !reduced && (
                                <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/15">
                                    {progress.duration !== null && (
                                        <span
                                            className="mock-progress block h-full bg-primary"
                                            style={{
                                                '--mock-progress-ms': `${progress.duration}ms`,
                                                animationPlayState: paused ? 'paused' : 'running',
                                            } as React.CSSProperties}
                                            onAnimationEnd={() => setProgress(p => (p.step === index ? {...p, barDone: true} : p))}
                                        />
                                    )}
                                </span>
                            )}
                        </TabsPrimitive.Trigger>
                    );
                })}
            </TabsPrimitive.List>

            <div ref={panelRef}>
                <TabsPrimitive.Content key={current} value={String(current)} className="mock-step-in outline-none">
                    <div className="flex items-start gap-3 p-4 sm:p-5">
                        <div className="min-w-0 flex-1 space-y-3">
                            <p className="leading-relaxed">{step.instruction}</p>
                            {step.action}
                        </div>
                        {!reduced && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setUserPaused(p => !p)}
                                aria-label={t(userPaused ? 'play' : 'pause')}
                                title={t(userPaused ? 'play' : 'pause')}
                                className="shrink-0 text-muted-foreground"
                            >
                                {userPaused ? <Play /> : <Pause />}
                            </Button>
                        )}
                    </div>
                    <div className="border-t bg-muted/30 p-3 sm:p-5 [&_.mock-frame>div:last-child]:min-h-72 sm:[&_.mock-frame>div:last-child]:min-h-80">
                        <MockPlayback.Provider value={playback}>
                            {step.mock}
                        </MockPlayback.Provider>
                    </div>
                </TabsPrimitive.Content>
            </div>
        </TabsPrimitive.Root>
    );
}
