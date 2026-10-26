'use client';

import { createFalling, createLayers, FallingParticle, FallingSpec, Frame, ParticleCanvas, stepFalling } from './ParticleCanvas';

const SNOWFLAKES: FallingSpec = {
    drift: 0.2,
    fallSpeeds: [0.3, 0.6, 1.0],
    sizes: [[1, 1.5], [1.5, 2.5], [2.5, 4]],
    opacity: [0.3, 0.7],
};
const PARALLAX = [10, 25, 45];

const createSnowflakes = (width: number, height: number) =>
    createLayers([60, 45, 30], layer => createFalling(SNOWFLAKES, width, height, layer));

function drawSnowflake(snowflake: FallingParticle, x: number, y: number, { ctx, isDark }: Frame) {
    const opacity = isDark ? snowflake.opacity : snowflake.opacity * 0.6;

    ctx.beginPath();
    ctx.arc(x, y, snowflake.size, 0, Math.PI * 2);
    ctx.fillStyle = isDark
        ? `oklch(0.98 0.01 240 / ${opacity})`
        : `oklch(0.5 0.02 240 / ${opacity})`;
    ctx.fill();

    if (isDark && snowflake.layer === 2) {
        ctx.beginPath();
        ctx.arc(x, y, snowflake.size * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `oklch(0.95 0.02 240 / ${opacity * 0.2})`;
        ctx.fill();
    }
}

export function SnowingBackground() {
    return <ParticleCanvas create={createSnowflakes} parallax={PARALLAX} step={stepFalling} draw={drawSnowflake} />;
}
