'use client';

import { simpleRandom } from 'utils/generalUtils.ts';
import {
    createFalling, createLayers, FallingParticle, FallingSpec, Frame, ParticleCanvas, randomAngle, stepFalling,
} from './ParticleCanvas';

interface Petal extends FallingParticle {
    rotation: number;
    angularVelocity: number;
}

// Path2D only exists in the browser, so the shape is built lazily on first draw.
let petalPath: Path2D | undefined;

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

const PETALS: FallingSpec = {
    drift: 0.15,
    fallSpeeds: [0.2, 0.4, 0.7],
    sizes: [[3, 4.5], [5, 7], [8, 11]],
    opacity: [0.45, 0.75],
};
const PARALLAX = [10, 25, 45];

const createPetals = (width: number, height: number): Petal[] => createLayers([45, 32, 20], layer => ({
    ...createFalling(PETALS, width, height, layer),
    rotation: randomAngle(),
    angularVelocity: simpleRandom(-0.004, 0.004),
}));

function stepPetal(petal: Petal, frame: Frame) {
    stepFalling(petal, frame);
    petal.rotation += petal.angularVelocity * frame.timeScale;
}

function drawPetal(petal: Petal, x: number, y: number, { ctx, isDark }: Frame) {
    const opacity = isDark ? petal.opacity : petal.opacity * 0.9;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(petal.rotation);
    ctx.scale(petal.size, petal.size);
    ctx.fillStyle = isDark
        ? `oklch(0.85 0.11 350 / ${opacity})`
        : `oklch(0.72 0.14 355 / ${opacity})`;
    ctx.fill(petalPath ??= buildPetalPath());
    ctx.restore();
}

export function SakuraBackground() {
    return <ParticleCanvas create={createPetals} parallax={PARALLAX} step={stepPetal} draw={drawPetal} />;
}
