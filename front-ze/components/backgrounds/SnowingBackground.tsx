'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { simpleRandom } from "utils/generalUtils.ts";

interface Snowflake {
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    opacity: number,
    swaySpeed: number,
    swayPhase: number,
    swayAmplitude: number,
    layer: number,
}

function createSnowflakes(canvasWidth: number, canvasHeight: number): Snowflake[] {
    const snowflakes: Snowflake[] = [];
    const layerCounts = [60, 45, 30];
    const fallSpeeds = [0.3, 0.6, 1.0];

    for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < layerCounts[layer]; i++) {
            const fallSpeed = fallSpeeds[layer];
            snowflakes.push({
                x: Math.random() * canvasWidth,
                y: Math.random() * canvasHeight,
                vx: simpleRandom(-0.2, 0.2),
                vy: fallSpeed * simpleRandom(0.7, 1.3),
                size: layer === 0 ? simpleRandom(1, 1.5) : layer === 1 ? simpleRandom(1.5, 2.5) : simpleRandom(2.5, 4),
                opacity: simpleRandom(0.3, 0.7),
                swaySpeed: simpleRandom(0.0005, 0.002),
                swayPhase: Math.random() * Math.PI * 2,
                swayAmplitude: simpleRandom(0.3, 1.0),
                layer,
            });
        }
    }
    return snowflakes;
}

export function SnowingBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const snowflakesRef = useRef<Snowflake[]>([]);
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

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            snowflakesRef.current = createSnowflakes(canvas.width, canvas.height);
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

            for (const snowflake of snowflakesRef.current) {
                const sway = Math.sin(time * snowflake.swaySpeed + snowflake.swayPhase) * snowflake.swayAmplitude;

                snowflake.x += (snowflake.vx + sway) * timeScale;
                snowflake.y += snowflake.vy * timeScale;

                if (snowflake.y > canvas.height + 20) {
                    snowflake.y = -20;
                    snowflake.x = Math.random() * canvas.width;
                }
                if (snowflake.x < -20) snowflake.x = canvas.width + 20;
                if (snowflake.x > canvas.width + 20) snowflake.x = -20;

                const offsetX = mouseOffsetX * parallaxStrength[snowflake.layer];
                const offsetY = mouseOffsetY * parallaxStrength[snowflake.layer];

                const finalOpacity = isDark
                    ? snowflake.opacity
                    : snowflake.opacity * 0.6;

                const drawX = snowflake.x + offsetX;
                const drawY = snowflake.y + offsetY;

                ctx.beginPath();
                ctx.arc(drawX, drawY, snowflake.size, 0, Math.PI * 2);
                ctx.fillStyle = isDark
                    ? `oklch(0.98 0.01 240 / ${finalOpacity})`
                    : `oklch(0.5 0.02 240 / ${finalOpacity})`;
                ctx.fill();

                if (isDark && snowflake.layer === 2) {
                    ctx.beginPath();
                    ctx.arc(drawX, drawY, snowflake.size * 1.8, 0, Math.PI * 2);
                    ctx.fillStyle = `oklch(0.95 0.02 240 / ${finalOpacity * 0.2})`;
                    ctx.fill();
                }
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
