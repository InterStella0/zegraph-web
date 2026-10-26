
type Vec3 = [number, number, number]
type Swatch = { hex: string, lab: Vec3, protan: Vec3, deutan: Vec3 }
type Shade = { L: number, a: number, b: number, C: number }
type Candidate = Shade & { linear: Vec3, swatch?: Swatch }

const MIN_DELTA_E = 10
const MIN_CVD_DELTA_E = 3
const MIN_LIGHTNESS = 0.48
const MAX_LIGHTNESS = 0.67
const MIN_CHROMA = 0.1
const MAX_CHROMA = 0.3
const LIGHTNESS_STEP = 0.01
const CHROMA_STEP = 0.02
const HUE_STEP = 3
const HUE_WEIGHT = 3

const MACHADO_PROTAN: Vec3[] = [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
]
const MACHADO_DEUTAN: Vec3[] = [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
]

const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const fromLinear = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
const LINEAR = Array.from({ length: 256 }, (_, i) => toLinear(i / 255))

function linearToHex(rgb: Vec3): string {
    const channel = (c: number) => Math.round(fromLinear(Math.min(1, Math.max(0, c))) * 255).toString(16).padStart(2, '0')
    return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}

function linearToOklab([r, g, b]: Vec3): Vec3 {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ]
}

function oklabToLinear([L, a, b]: Vec3): Vec3 {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ]
}

function simulate(matrix: Vec3[], [r, g, b]: Vec3): Vec3 {
    return matrix.map(row => Math.min(1, Math.max(0, row[0] * r + row[1] * g + row[2] * b))) as Vec3
}

function swatch(hex: string): Swatch {
    const linear: Vec3 = [1, 3, 5].map(i => LINEAR[parseInt(hex.slice(i, i + 2), 16)]) as Vec3
    return {
        hex,
        lab: linearToOklab(linear),
        protan: linearToOklab(simulate(MACHADO_PROTAN, linear)),
        deutan: linearToOklab(simulate(MACHADO_DEUTAN, linear)),
    }
}

function shade([L, a, b]: Vec3): Shade {
    return { L, a, b, C: Math.hypot(a, b) }
}

function deltaE(a: Vec3, b: Vec3): number {
    return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function isSeparated(color: Swatch, taken: Swatch[]): boolean {
    return taken.every(other =>
        deltaE(color.lab, other.lab) >= MIN_DELTA_E
        && deltaE(color.protan, other.protan) >= MIN_CVD_DELTA_E
        && deltaE(color.deutan, other.deutan) >= MIN_CVD_DELTA_E
    )
}

function separation(color: Swatch, taken: Swatch[]): number {
    const worst = Math.min(...taken.flatMap(other => [
        deltaE(color.lab, other.lab) / MIN_DELTA_E,
        deltaE(color.protan, other.protan) / MIN_CVD_DELTA_E,
        deltaE(color.deutan, other.deutan) / MIN_CVD_DELTA_E,
    ]))
    return Math.round(worst * 1e6)
}

function shiftCost(color: Shade, wanted: Shade): number {
    const dL = color.L - wanted.L
    const dC = color.C - wanted.C
    const dH2 = Math.max(0, (color.a - wanted.a) ** 2 + (color.b - wanted.b) ** 2 - dC * dC)
    return Math.round(Math.sqrt(dL * dL + dC * dC + HUE_WEIGHT * HUE_WEIGHT * dH2) * 1e6)
}

let grid: Candidate[] | null = null

function candidateGrid(): Candidate[] {
    if (grid) return grid
    grid = []
    const lightnessSteps = Math.round((MAX_LIGHTNESS - MIN_LIGHTNESS) / LIGHTNESS_STEP)
    const chromaSteps = Math.round((MAX_CHROMA - MIN_CHROMA) / CHROMA_STEP)
    for (let li = 0; li <= lightnessSteps; li++) {
        for (let ci = 0; ci <= chromaSteps; ci++) {
            for (let hi = 0; hi * HUE_STEP < 360; hi++) {
                const L = MIN_LIGHTNESS + li * LIGHTNESS_STEP
                const C = MIN_CHROMA + ci * CHROMA_STEP
                const h = hi * HUE_STEP * Math.PI / 180
                const a = C * Math.cos(h)
                const b = C * Math.sin(h)
                const linear = oklabToLinear([L, a, b])
                if (linear.some(c => c < -1e-4 || c > 1 + 1e-4)) continue
                grid.push({ L, a, b, C, linear })
            }
        }
    }
    return grid
}

function candidateSwatch(candidate: Candidate): Swatch {
    return candidate.swatch ??= swatch(linearToHex(candidate.linear))
}

function nearestSeparated(wanted: Swatch, taken: Swatch[]): Swatch {
    const target = shade(wanted.lab)
    const candidates = candidateGrid()
    let best: Candidate | null = null
    let bestCost = Infinity
    for (const candidate of candidates) {
        const cost = shiftCost(candidate, target)
        if (cost >= bestCost || !isSeparated(candidateSwatch(candidate), taken)) continue
        best = candidate
        bestCost = cost
    }
    if (best) return candidateSwatch(best)

    let bestSeparation = -Infinity
    for (const candidate of candidates) {
        const spread = separation(candidateSwatch(candidate), taken)
        const cost = shiftCost(candidate, target)
        if (spread < bestSeparation || (spread === bestSeparation && cost >= bestCost)) continue
        best = candidate
        bestSeparation = spread
        bestCost = cost
    }
    return candidateSwatch(best)
}

const paletteCache = new Map<string, string[]>()

export function assignCommunityColors(preferred: string[], taken: string[] = []): string[] {
    const signature = `${preferred.join(',')}|${taken.join(',')}`
    const cached = paletteCache.get(signature)
    if (cached) return cached

    const assigned = taken.map(swatch)
    const colors = preferred.map(hex => {
        const wanted = swatch(hex)
        const { L, C } = shade(wanted.lab)
        const inRegion = L >= MIN_LIGHTNESS && L <= MAX_LIGHTNESS && C >= MIN_CHROMA
        const color = inRegion && isSeparated(wanted, assigned) ? wanted : nearestSeparated(wanted, assigned)
        assigned.push(color)
        return color.hex
    })
    paletteCache.set(signature, colors)
    return colors
}
