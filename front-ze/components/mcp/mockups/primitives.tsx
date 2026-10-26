'use client';

import {createContext, ReactNode, useContext, useEffect, useRef, useState} from 'react';
import {cn} from 'components/lib/utils';
import {useMediaQuery} from 'lib/hooks/useMediaQuery';
import {useInView} from 'lib/hooks/useInView';
import './mockups.css';

export type MockVariant = 'claude' | 'chatgpt';
/** One scene phase: how long it shows, the `data-mock` element the cursor points at, and whether it clicks there. */
export type MockPhase = readonly [ms: number, target?: string, action?: 'click'];
export type MockBoxProps = { children: ReactNode, className?: string, 'data-mock'?: string };

const CURSOR_TRAVEL_MS = 650;
const CURSOR_SETTLE_MS = CURSOR_TRAVEL_MS + 50;

export const MockPlayback = createContext<{
    paused: boolean,
    onDone: () => void,
    onDuration: (ms: number) => void,
} | null>(null);

export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

function cursorMoves(phases: readonly MockPhase[], from: number, to: number) {
    const target = phases[to][1];
    return Boolean(target && target !== phases[from][1]);
}

export function MockScene({label, phases, className, children}: {
    label: string,
    phases: readonly MockPhase[],
    className?: string,
    children: (phase: number) => ReactNode,
}) {
    const ref = useRef<HTMLDivElement>(null);
    const reduced = usePrefersReducedMotion();
    const visible = useInView(ref);
    const [phase, setPhase] = useState(0);
    const [cursorPhase, setCursorPhase] = useState(0);
    const [delayedClickPhase, setDelayedClickPhase] = useState<number | null>(null);
    const playback = useContext(MockPlayback);
    const running = !reduced && (playback ? !playback.paused : visible);
    const onDone = playback?.onDone;
    const onDuration = playback?.onDuration;

    useEffect(() => {
        onDuration?.(phases.reduce(
            (total, [ms], i) => total + ms + (i < phases.length - 1 && cursorMoves(phases, i, i + 1) ? CURSOR_SETTLE_MS : 0),
            0,
        ));
    }, [onDuration, phases]);

    useEffect(() => {
        if (!running) return;
        let commitId: ReturnType<typeof setTimeout> | undefined;
        const advanceId = setTimeout(() => {
            if (onDone && phase === phases.length - 1) {
                onDone();
                return;
            }
            const next = (phase + 1) % phases.length;
            const moves = cursorMoves(phases, phase, next);
            const targetShown = moves && ref.current?.querySelector(`[data-mock="${phases[next][1]}"]`);

            setCursorPhase(next);
            if (targetShown) {
                setDelayedClickPhase(null);
                commitId = setTimeout(() => setPhase(next), CURSOR_SETTLE_MS);
                return;
            }

            setDelayedClickPhase(moves ? next : null);
            setPhase(next);
        }, phases[phase][0]);

        return () => {
            clearTimeout(advanceId);
            if (commitId) clearTimeout(commitId);
        };
    }, [phase, running, onDone, phases]);

    const cue = reduced ? undefined : phases[cursorPhase];

    return (
        <div ref={ref} role="img" aria-label={label} className={cn('relative select-none', className)}>
            <div aria-hidden>{children(reduced ? phases.length - 1 : phase)}</div>
            <MockCursor
                sceneRef={ref}
                target={cue?.[1]}
                click={cue?.[2] === 'click' && phase === cursorPhase}
                phase={cursorPhase}
                clickDelay={delayedClickPhase === cursorPhase ? CURSOR_SETTLE_MS : 0}
            />
        </div>
    );
}

function MockCursor({sceneRef, target, click, phase, clickDelay}: {
    sceneRef: React.RefObject<HTMLDivElement>,
    target?: string,
    click: boolean,
    phase: number,
    clickDelay: number,
}) {
    const [pos, setPos] = useState<{ x: number, y: number } | null>(null);
    const [transitionReady, setTransitionReady] = useState(false);

    useEffect(() => {
        if (!pos || transitionReady) return;
        const id = requestAnimationFrame(() => setTransitionReady(true));
        return () => cancelAnimationFrame(id);
    }, [pos, transitionReady]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene || !target) return;
        const measure = () => {
            const el = scene.querySelector<HTMLElement>(`[data-mock="${target}"]`);
            if (!el) return;
            const s = scene.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            setPos({x: r.left - s.left + Math.min(r.width * 0.6, 40), y: r.top - s.top + r.height * 0.6});
        };
        measure();
        const frame = requestAnimationFrame(measure);
        const observer = new ResizeObserver(measure);
        observer.observe(scene);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [sceneRef, target, phase]);

    return (
        <div
            className="mock-cursor pointer-events-none absolute left-0 top-0 z-20"
            style={{
                transform: pos ? `translate(${pos.x}px, ${pos.y}px)` : 'translate(90%, 110%)',
                opacity: target && pos ? 1 : 0,
                transition: transitionReady ? undefined : 'none',
            }}
        >
            <div
                key={click ? phase : 'idle'}
                className={cn('relative', click && 'mock-click')}
                style={click ? {'--mock-click-delay': `${clickDelay}ms`} as React.CSSProperties : undefined}
            >
                <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-md">
                    <path d="M1 1 L1 16 L5 12 L8 19 L11 17.6 L8 11 L14 11 Z" fill="#fff" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
            </div>
        </div>
    );
}

export function MockFrame({variant, address, sidebar, children, className, bodyClassName}: {
    variant: MockVariant,
    address: string,
    sidebar?: ReactNode,
    children: ReactNode,
    className?: string,
    bodyClassName?: string,
}) {
    return (
        <div className={cn(
            `mock-frame mock-${variant} overflow-hidden rounded-xl border border-(--m-border) bg-(--m-bg) text-(--m-text) shadow-lg`,
            'text-[11px] leading-snug sm:text-xs',
            className,
        )}>
            <div className="flex items-center gap-2 border-b border-(--m-border) bg-(--m-panel) px-3 py-1.5">
                <div className="flex gap-1">
                    {['bg-[#ff5f57]', 'bg-[#febc2e]', 'bg-[#28c840]'].map(bg => (
                        <span key={bg} className={cn('size-2 rounded-full', bg)} />
                    ))}
                </div>
                <div className="mx-auto max-w-[70%] truncate rounded-md bg-(--m-bg) px-3 py-0.5 text-[10px] text-(--m-muted)">
                    {address}
                </div>
            </div>
            <div className={cn('flex min-h-60', bodyClassName)}>
                {sidebar && (
                    <div className="hidden w-32 shrink-0 border-r border-(--m-border) bg-(--m-panel) p-2 min-[480px]:block">
                        {sidebar}
                    </div>
                )}
                <div className="relative min-w-0 flex-1">{children}</div>
            </div>
        </div>
    );
}

export function spot(on: boolean) {
    return on ? 'mock-spotlight' : '';
}

/** Shows the placeholder before phase `at`, types `text` out during it, and shows it in full afterwards. */
export function TypeIn({text, phase, at, placeholder, ms = 1200, className}: {
    text: string,
    phase: number,
    at: number,
    placeholder?: string,
    ms?: number,
    className?: string,
}) {
    const [count, setCount] = useState(0);
    const typing = phase === at;
    useEffect(() => {
        if (!typing) return;
        setCount(0);
        const step = Math.max(20, ms / text.length);
        const id = setInterval(() => setCount(c => (c >= text.length ? c : c + 1)), step);
        return () => clearInterval(id);
    }, [typing, text, ms]);

    if (phase < at) {
        return <span className={cn('text-(--m-muted) opacity-70', className)}>{placeholder}</span>;
    }
    return (
        <span className={className}>
            {typing ? text.slice(0, count) : text}
            {typing && <span className="mock-caret" />}
        </span>
    );
}

export function MockToggle({on, className}: { on: boolean, className?: string }) {
    return (
        <span className={cn(
            'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-300',
            on ? 'bg-[var(--m-switch,var(--m-accent))]' : 'bg-(--m-border)',
            className,
        )}>
            <span className={cn(
                'absolute size-3 rounded-full bg-[var(--m-knob,#fff)] shadow transition-transform duration-300',
                on ? 'translate-x-3.5' : 'translate-x-0.5',
            )} />
        </span>
    );
}

export function MockInput({children, active, className, ...rest}: MockBoxProps & { active?: boolean }) {
    return (
        <div
            {...rest}
            className={cn(
                'truncate rounded-md border bg-(--m-surface) px-2 py-1.5 transition-colors',
                active ? 'border-(--m-text)/60' : 'border-(--m-border)',
                className,
            )}
        >
            {children}
        </div>
    );
}

export function MockButton({children, primary, className, ...rest}: MockBoxProps & { primary?: boolean }) {
    return (
        <span
            {...rest}
            className={cn(
                'inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1 font-medium',
                primary ? 'bg-(--m-primary) text-(--m-primary-fg)' : 'border border-(--m-border) bg-(--m-surface)',
                className,
            )}
        >
            {children}
        </span>
    );
}
