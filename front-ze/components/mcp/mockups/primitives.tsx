'use client';

import {createContext, ReactNode, useContext, useEffect, useRef, useState} from 'react';
import {cn} from 'components/lib/utils';
import './mockups.css';

export type MockVariant = 'claude' | 'chatgpt';
/** Where the fake cursor should be during a phase: a `data-mock` target inside the scene. */
export type CursorCue = { target: string, click?: boolean } | null;

// Keep this in sync with the transform transition in mockups.css. The small settling buffer makes
// sure the cursor is visibly at rest before the target reacts.
const CURSOR_TRAVEL_MS = 650;
const CURSOR_SETTLE_MS = CURSOR_TRAVEL_MS + 50;

/**
 * Set by a guide that plays its scenes back to back. A scene inside it plays once instead of
 * looping, holds its last phase and calls `onDone`; `onDuration` gets its expected running time up
 * front so the guide can draw a progress bar. Visibility is the guide's job here: it passes `paused`.
 */
export type MockPlaybackControl = {
    paused: boolean,
    onDone: () => void,
    onDuration: (ms: number) => void,
};

export const MockPlayback = createContext<MockPlaybackControl | null>(null);

export function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(query.matches);
        const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);
    return reduced;
}

/**
 * A scene is a looping sequence of phases, each held for `durations[i]` ms. It only plays while on
 * screen, and plays once under a `MockPlayback` guide. With reduced motion it stays on the last
 * phase, so that phase should be the most instructive still frame.
 */
export function MockScene({label, durations, cursor, className, children}: {
    label: string,
    durations: readonly number[],
    cursor?: (phase: number) => CursorCue,
    className?: string,
    children: (phase: number) => ReactNode,
}) {
    const ref = useRef<HTMLDivElement>(null);
    const reduced = usePrefersReducedMotion();
    const [visible, setVisible] = useState(false);
    const [phase, setPhase] = useState(0);
    const [cursorPhase, setCursorPhase] = useState(0);
    const [delayedClickPhase, setDelayedClickPhase] = useState<number | null>(null);
    const playback = useContext(MockPlayback);
    const running = !reduced && (playback ? !playback.paused : visible);
    const onDone = playback?.onDone;
    const onDuration = playback?.onDuration;

    // An upper bound: every change of cursor target may hold the next phase until the cursor lands.
    useEffect(() => {
        if (!onDuration) return;
        let total = 0;
        durations.forEach((ms, i) => {
            total += ms;
            const next = cursor?.(i + 1)?.target;
            if (i < durations.length - 1 && next && next !== cursor?.(i)?.target) total += CURSOR_SETTLE_MS;
        });
        onDuration(total);
    }, [onDuration, durations, cursor]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {threshold: 0.4});
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!running) return;
        let commitId: ReturnType<typeof setTimeout> | undefined;
        const advanceId = setTimeout(() => {
            if (onDone && phase === durations.length - 1) {
                onDone();
                return;
            }
            const next = (phase + 1) % durations.length;
            const currentCue = cursor?.(phase) ?? null;
            const nextCue = cursor?.(next) ?? null;
            const targetChanged = Boolean(nextCue?.target && nextCue.target !== currentCue?.target);
            const targetExists = Boolean(
                nextCue?.target && ref.current?.querySelector(`[data-mock="${nextCue.target}"]`),
            );

            // Let the cursor lead interactions whenever its destination is already on screen. This
            // prevents buttons, toggles and menus from reacting while the pointer is still en route.
            setCursorPhase(next);
            if (targetChanged && targetExists) {
                setDelayedClickPhase(null);
                commitId = setTimeout(() => setPhase(next), CURSOR_SETTLE_MS);
                return;
            }

            // Some destinations are introduced by the next phase (for example, an item inside a
            // menu that has just opened). Render those first, then delay only their click ripple.
            setDelayedClickPhase(targetChanged && !targetExists ? next : null);
            setPhase(next);
        }, durations[phase]);

        return () => {
            clearTimeout(advanceId);
            if (commitId) clearTimeout(commitId);
        };
    }, [phase, running, onDone, durations, cursor]);

    const shown = reduced ? durations.length - 1 : phase;
    const cursorCue = reduced ? null : cursor?.(cursorPhase) ?? null;
    const cue = cursorCue && {
        ...cursorCue,
        // A click belongs at the destination, not at the beginning of the cursor's journey.
        click: cursorCue.click && phase === cursorPhase,
    };

    return (
        <div ref={ref} role="img" aria-label={label} className={cn('relative select-none', className)}>
            <div aria-hidden>{children(shown)}</div>
            <MockCursor
                sceneRef={ref}
                cue={cue}
                phase={cursorPhase}
                clickDelay={delayedClickPhase === cursorPhase ? CURSOR_SETTLE_MS : 0}
            />
        </div>
    );
}

function MockCursor({sceneRef, cue, phase, clickDelay}: {
    sceneRef: React.RefObject<HTMLDivElement>,
    cue: CursorCue,
    phase: number,
    clickDelay: number,
}) {
    const [pos, setPos] = useState<{ x: number, y: number } | null>(null);
    const [transitionReady, setTransitionReady] = useState(false);
    const target = cue?.target;

    // Place a newly mounted cursor directly on its starting cue. Subsequent target changes animate;
    // otherwise every scene appears to fly in from the top-left fallback position.
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
        // A scene can be swapped in under the same guide slot. Measure again after that commit so
        // its first cue is resolved against the new scene rather than the outgoing one.
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
                key={cue?.click ? phase : 'idle'}
                className={cn('relative', cue?.click && 'mock-click')}
                style={cue?.click ? {'--mock-click-delay': `${clickDelay}ms`} as React.CSSProperties : undefined}
            >
                <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-md">
                    <path d="M1 1 L1 16 L5 12 L8 19 L11 17.6 L8 11 L14 11 Z" fill="#fff" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
            </div>
        </div>
    );
}

/** Window chrome with a fake address bar and an optional left sidebar. */
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
                    <span className="size-2 rounded-full bg-[#ff5f57]" />
                    <span className="size-2 rounded-full bg-[#febc2e]" />
                    <span className="size-2 rounded-full bg-[#28c840]" />
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

/** Pulsing highlight around whatever the user should click in this step. */
export function spot(on: boolean) {
    return on ? 'mock-spotlight' : '';
}

/** Text that types itself in while `state` is 'typing'. */
export function TypeIn({text, state, placeholder, ms = 1200, className}: {
    text: string,
    state: 'empty' | 'typing' | 'done',
    placeholder?: string,
    ms?: number,
    className?: string,
}) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (state !== 'typing') return;
        setCount(0);
        const step = Math.max(20, ms / text.length);
        const id = setInterval(() => setCount(c => (c >= text.length ? c : c + 1)), step);
        return () => clearInterval(id);
    }, [state, text, ms]);

    if (state === 'empty') {
        return <span className={cn('text-(--m-muted) opacity-70', className)}>{placeholder}</span>;
    }
    const shown = state === 'done' ? text : text.slice(0, count);
    return (
        <span className={className}>
            {shown}
            {state === 'typing' && <span className="mock-caret" />}
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

export function MockInput({children, active, className, ...rest}: {
    children: ReactNode,
    active?: boolean,
    className?: string,
    'data-mock'?: string,
}) {
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

export function MockButton({children, primary, className, ...rest}: {
    children: ReactNode,
    primary?: boolean,
    className?: string,
    'data-mock'?: string,
}) {
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
