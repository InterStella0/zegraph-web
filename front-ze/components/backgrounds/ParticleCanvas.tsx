'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { range, simpleRandom } from 'utils/generalUtils.ts';

export interface Particle {
    x: number;
    y: number;
    layer: number;
}

export interface Frame {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    time: number;
    timeScale: number;
    isDark: boolean;
}

interface ParticleCanvasProps<T extends Particle> {
    create: (width: number, height: number) => T[];
    /** Mouse parallax shift in px per layer. */
    parallax: number[];
    step: (particle: T, frame: Frame) => void;
    draw: (particle: T, x: number, y: number, frame: Frame) => void;
}

export const randomAngle = () => Math.random() * Math.PI * 2;

export const createLayers = <T,>(counts: number[], make: (layer: number) => T): T[] =>
    counts.flatMap((count, layer) => range(count).map(() => make(layer)));

export interface FallingParticle extends Particle {
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    swaySpeed: number;
    swayPhase: number;
    swayAmplitude: number;
}

export interface FallingSpec {
    drift: number;
    fallSpeeds: number[];
    sizes: [number, number][];
    opacity: [number, number];
}

export function createFalling({ drift, fallSpeeds, sizes, opacity }: FallingSpec, width: number, height: number, layer: number): FallingParticle {
    return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: simpleRandom(-drift, drift),
        vy: fallSpeeds[layer] * simpleRandom(0.7, 1.3),
        size: simpleRandom(...sizes[layer]),
        opacity: simpleRandom(...opacity),
        swaySpeed: simpleRandom(0.0005, 0.002),
        swayPhase: randomAngle(),
        swayAmplitude: simpleRandom(0.3, 1.0),
        layer,
    };
}

export function stepFalling(p: FallingParticle, { time, timeScale, width, height }: Frame) {
    const sway = Math.sin(time * p.swaySpeed + p.swayPhase) * p.swayAmplitude;
    p.x += (p.vx + sway) * timeScale;
    p.y += p.vy * timeScale;

    if (p.y > height + 20) {
        p.y = -20;
        p.x = Math.random() * width;
    }
    if (p.x < -20) p.x = width + 20;
    if (p.x > width + 20) p.x = -20;
}

/** Full-viewport canvas of layered particles that drift with a smoothed mouse parallax. Callbacks must be stable (module-level). */
export function ParticleCanvas<T extends Particle>({ create, parallax, step, draw }: ParticleCanvasProps<T>) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const themeRef = useRef<string>('dark');
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        themeRef.current = resolvedTheme ?? 'dark';
    }, [resolvedTheme]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        let particles: T[] = [];
        let animation = 0;
        let lastTime = 0;
        const mouse = { x: 0.5, y: 0.5 };
        const smoothMouse = { x: 0.5, y: 0.5 };

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            particles = create(canvas.width, canvas.height);
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX / window.innerWidth;
            mouse.y = e.clientY / window.innerHeight;
        };

        const render = (time: number) => {
            const timeScale = (lastTime ? time - lastTime : 16.67) / 16.67;
            lastTime = time;
            const frame: Frame = {
                ctx, time, timeScale,
                width: canvas.width,
                height: canvas.height,
                isDark: themeRef.current === 'dark',
            };

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const lerp = 0.03 * timeScale;
            smoothMouse.x += (mouse.x - smoothMouse.x) * lerp;
            smoothMouse.y += (mouse.y - smoothMouse.y) * lerp;
            const mouseOffsetX = (smoothMouse.x - 0.5) * 2;
            const mouseOffsetY = (smoothMouse.y - 0.5) * 2;

            for (const particle of particles) {
                step(particle, frame);
                const strength = parallax[particle.layer];
                draw(particle, particle.x + mouseOffsetX * strength, particle.y + mouseOffsetY * strength, frame);
            }

            animation = requestAnimationFrame(render);
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('mousemove', handleMouseMove);
        animation = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animation);
        };
    }, [create, parallax, step, draw]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: -1 }}
        />
    );
}
