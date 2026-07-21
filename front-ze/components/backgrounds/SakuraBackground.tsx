'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { simpleRandom } from 'utils/generalUtils.ts';

interface Petal {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    rotation: number;
    angularVelocity: number;
    swayPhase: number;
    swaySpeed: number;
    swayAmplitude: number;
    layer: number;
}

function buildPetalPath(): Path2D {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(0.35, 0.15, 0.55, 0.6, 0.25, 1);
    p.lineTo(0, 0.92);
    p.lineTo(-0.25, 1);
    p.bezierCurveTo(-0.55, 0.6, -0.35, 0.15, 0, 0);
    p.closePath();
    return p;
}

function createPetals(canvasWidth: number, canvasHeight: number): Petal[] {
    const petals: Petal[] = [];
    const layerCounts = [45, 32, 20];
    const fallSpeeds = [0.2, 0.4, 0.7];

    for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < layerCounts[layer]; i++) {
            const fallSpeed = fallSpeeds[layer];
            petals.push({
                x: Math.random() * canvasWidth,
                y: Math.random() * canvasHeight,
                vx: simpleRandom(-0.15, 0.15),
                vy: fallSpeed * simpleRandom(0.7, 1.3),
                size: layer === 0 ? simpleRandom(3, 4.5) : layer === 1 ? simpleRandom(5, 7) : simpleRandom(8, 11),
                opacity: simpleRandom(0.45, 0.75),
                rotation: Math.random() * Math.PI * 2,
                angularVelocity: simpleRandom(-0.004, 0.004),
                swayPhase: Math.random() * Math.PI * 2,
                swaySpeed: simpleRandom(0.0005, 0.002),
                swayAmplitude: simpleRandom(0.3, 1.0),
                layer,
            });
        }
    }
    return petals;
}

export function SakuraBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const petalsRef = useRef<Petal[]>([]);
    const mouseRef = useRef({ x: 0.5, y: 0.5 });
    const smoothMouseRef = useRef({ x: 0.5, y: 0.5 });
    const animationRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const themeRef = useRef<string>('dark');
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        themeRef.current = resolvedTheme ?? 'dark';
    }, [resolvedTheme]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const petalPath = buildPetalPath();

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            petalsRef.current = createPetals(canvas.width, canvas.height);
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouseRef.current = {
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight,
            };
        };

        const draw = (time: number) => {
            const deltaTime = lastTimeRef.current ? time - lastTimeRef.current : 16.67;
            lastTimeRef.current = time;
            const timeScale = deltaTime / 16.67;

            const isDark = themeRef.current === 'dark';

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const lerp = 0.03 * timeScale;
            smoothMouseRef.current.x += (mouseRef.current.x - smoothMouseRef.current.x) * lerp;
            smoothMouseRef.current.y += (mouseRef.current.y - smoothMouseRef.current.y) * lerp;

            const parallaxStrength = [10, 25, 45];

            const mouseOffsetX = (smoothMouseRef.current.x - 0.5) * 2;
            const mouseOffsetY = (smoothMouseRef.current.y - 0.5) * 2;

            for (const petal of petalsRef.current) {
                const sway = Math.sin(time * petal.swaySpeed + petal.swayPhase) * petal.swayAmplitude;

                petal.x += (petal.vx + sway) * timeScale;
                petal.y += petal.vy * timeScale;
                petal.rotation += petal.angularVelocity * timeScale;

                if (petal.y > canvas.height + 20) {
                    petal.y = -20;
                    petal.x = Math.random() * canvas.width;
                }
                if (petal.x < -20) petal.x = canvas.width + 20;
                if (petal.x > canvas.width + 20) petal.x = -20;

                const offsetX = mouseOffsetX * parallaxStrength[petal.layer];
                const offsetY = mouseOffsetY * parallaxStrength[petal.layer];

                const finalOpacity = isDark ? petal.opacity : petal.opacity * 0.9;

                const drawX = petal.x + offsetX;
                const drawY = petal.y + offsetY;

                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(petal.rotation);
                ctx.scale(petal.size, petal.size);
                ctx.fillStyle = isDark
                    ? `oklch(0.85 0.11 350 / ${finalOpacity})`
                    : `oklch(0.72 0.14 355 / ${finalOpacity})`;
                ctx.fill(petalPath);
                ctx.restore();
            }

            animationRef.current = requestAnimationFrame(draw);
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('mousemove', handleMouseMove);
        animationRef.current = requestAnimationFrame(draw);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationRef.current);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: -1 }}
        />
    );
}
