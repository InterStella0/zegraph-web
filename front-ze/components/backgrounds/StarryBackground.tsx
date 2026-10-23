'use client';

import { simpleRandom } from "utils/generalUtils.ts";
import { createLayers, Frame, Particle, ParticleCanvas, randomAngle } from './ParticleCanvas';

interface Star extends Particle {
    vx: number,
    vy: number,
    size: number,
    opacity: number,
    twinkleSpeed: number,
    twinklePhase: number,
}

const SPEEDS = [0.15, 0.25, 0.4];
const SIZES = [0.75, 1.1, 1.5];
const PARALLAX = [15, 35, 60];

const createStars = (width: number, height: number) => createLayers([45, 33, 25], (layer): Star => {
    const angle = randomAngle();
    return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * SPEEDS[layer] * (0.5 + Math.random() * 0.5),
        vy: Math.sin(angle) * SPEEDS[layer] * (0.5 + Math.random() * 0.5),
        size: SIZES[layer],
        opacity: simpleRandom(.3, .5),
        twinkleSpeed: simpleRandom(.0001, .001),
        twinklePhase: randomAngle(),
        layer,
    };
});

function stepStar(star: Star, { timeScale, width, height }: Frame) {
    star.x += star.vx * timeScale;
    star.y += star.vy * timeScale;

    if (star.x < -50) star.x = width + 50;
    if (star.x > width + 50) star.x = -50;
    if (star.y < -50) star.y = height + 50;
    if (star.y > height + 50) star.y = -50;
}

function drawStar(star: Star, x: number, y: number, { ctx, time, isDark }: Frame) {
    const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase);
    const opacity = star.opacity * (0.6 + twinkle * 0.4);
    const finalOpacity = isDark ? opacity : opacity * 0.8;

    ctx.beginPath();
    ctx.arc(x, y, star.size, 0, Math.PI * 2);
    ctx.fillStyle = isDark
        ? `oklch(0.949 0.05 330 / ${finalOpacity})`
        : `oklch(0.145 0.08 35 /${finalOpacity})`;
    ctx.fill();

    if (isDark && star.layer === 2 && opacity > 0.6) {
        ctx.beginPath();
        ctx.arc(x, y, star.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = `oklch(0.949 0.05 330 / ${finalOpacity * 0.15})`;
        ctx.fill();
    }
}

export function StarryBackground() {
    return <ParticleCanvas create={createStars} parallax={PARALLAX} step={stepStar} draw={drawStar} />;
}
