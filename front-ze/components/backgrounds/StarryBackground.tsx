'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import {simpleRandom} from "utils/generalUtils.ts";

interface Star {
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    opacity: number,
    twinkleSpeed: number,
    twinklePhase: number,
    layer: number,
}

function createStars(canvasWidth: number, canvasHeight: number ): Star[]{
    const stars: Star[] = [];
    const layerCounts = [45, 33, 25];
    const speedMultipliers = [0.15, 0.25, 0.4];

    for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < layerCounts[layer]; i++) {
            const speed = speedMultipliers[layer];
            const angle = Math.random() * Math.PI * 2;
            stars.push({
                x: Math.random() * canvasWidth,
                y: Math.random() * canvasHeight,
                vx: Math.cos(angle) * speed * (0.5 + Math.random() * 0.5),
                vy: Math.sin(angle) * speed * (0.5 + Math.random() * 0.5),
                size: layer === 0 ? .75 : layer === 1 ? 1.1 : 1.5,
                opacity: simpleRandom(.3, .5),
                twinkleSpeed: simpleRandom(.0001, .001),
                twinklePhase: Math.random() * Math.PI * 2,
                layer,
            });
        }
    }
    return stars
}

export function StarryBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const starsRef = useRef<Star[]>([]);
    const mouseRef = useRef({ x: 0.5, y: 0.5 });
    const smoothMouseRef = useRef({ x: 0.5, y: 0.5 });
    const animationRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const themeRef = useRef<string>('dark');
    const { resolvedTheme } = useTheme();

    // Keep theme in a ref so the animation loop can read it without re-initializing
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
            starsRef.current = createStars(canvas.width, canvas.height)
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

            const lerp = 0.03 * timeScale; // slower follow for more delay
            smoothMouseRef.current.x += (mouseRef.current.x - smoothMouseRef.current.x) * lerp;
            smoothMouseRef.current.y += (mouseRef.current.y - smoothMouseRef.current.y) * lerp;

            const parallaxStrength = [15, 35, 60]; // pixels of movement

            const mouseOffsetX = (smoothMouseRef.current.x - 0.5) * 2;
            const mouseOffsetY = (smoothMouseRef.current.y - 0.5) * 2;

            for (const star of starsRef.current) {
                star.x += star.vx * timeScale;
                star.y += star.vy * timeScale;

                if (star.x < -50) star.x = canvas.width + 50;
                if (star.x > canvas.width + 50) star.x = -50;
                if (star.y < -50) star.y = canvas.height + 50;
                if (star.y > canvas.height + 50) star.y = -50;

                const offsetX = mouseOffsetX * parallaxStrength[star.layer];
                const offsetY = mouseOffsetY * parallaxStrength[star.layer];

                const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase);
                const opacity = star.opacity * (0.6 + twinkle * 0.4);

                const finalOpacity = isDark
                    ? opacity
                    : opacity * 0.8;

                const drawX = star.x + offsetX;
                const drawY = star.y + offsetY;

                ctx.beginPath();
                ctx.arc(drawX, drawY, star.size, 0, Math.PI * 2);
                ctx.fillStyle = isDark
                    ? `oklch(0.949 0.05 330 / ${finalOpacity})`
                    : `oklch(0.145 0.08 35 /${finalOpacity})`;
                ctx.fill();

                if (isDark && star.layer === 2 && opacity > 0.6) {
                    ctx.beginPath();
                    ctx.arc(drawX, drawY, star.size * 2, 0, Math.PI * 2);
                    ctx.fillStyle = `oklch(0.949 0.05 330 / ${finalOpacity * 0.15})`;
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
