
export const COLOR_ALGO_VERSION = 2

const ALPHA_THRESHOLD = 128
const MAX_SAMPLE_SIDE = 256
const MAX_DRAW_PIXELS = 2048 * 2048
const HUE_BINS = 36
const HUE_WINDOW = 30
const MEAN_SHIFT_ITERATIONS = 16
const MIN_VIBRANT_SHARE = 0.05
const MONOCHROME = 'none'

export function hashString(s: string): number {
    let hash = 0
    for (let i = 0; i < s.length; i++) {
        hash = s.charCodeAt(i) + ((hash << 5) - hash)
    }
    return Math.abs(hash)
}

function hslToHex(h: number, s: number, l: number): string {
    const a = s * Math.min(l, 1 - l)
    const channel = (n: number) => {
        const k = (n + h / 30) % 12
        const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
        return Math.round(255 * value).toString(16).padStart(2, '0')
    }
    return `#${channel(0)}${channel(8)}${channel(4)}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h: number
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
    return [h * 360, s, l]
}

export function nameHashColor(name: string): string {
    return hslToHex(hashString(name) % 360, 0.65, 0.5)
}

function hueDistance(a: number, b: number): number {
    return Math.abs((((a - b) % 360) + 540) % 360 - 180)
}

function toStableHex(r: number, g: number, b: number): string {
    const [h, s, l] = rgbToHsl(r, g, b)
    return hslToHex(Math.round(h), Math.round(s * 100) / 100, Math.round(l * 100) / 100)
}

export function extractDominantColor(data: Uint8ClampedArray): string | null {
    const hueMass = new Float64Array(HUE_BINS)
    const offsets: number[] = []
    const hues: number[] = []
    let opaque = 0
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < ALPHA_THRESHOLD) continue
        opaque++
        const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
        if (s < 0.25 || l < 0.15 || l > 0.85) continue
        offsets.push(i)
        hues.push(h)
        const position = h / (360 / HUE_BINS)
        const low = Math.floor(position)
        hueMass[low % HUE_BINS] += 1 - (position - low)
        hueMass[(low + 1) % HUE_BINS] += position - low
    }
    if (hues.length === 0 || hues.length < opaque * MIN_VIBRANT_SHARE) return null

    let peak = 0
    let peakMass = -1
    for (let k = 0; k < HUE_BINS; k++) {
        const mass = hueMass[(k + HUE_BINS - 1) % HUE_BINS] + 2 * hueMass[k] + hueMass[(k + 1) % HUE_BINS]
        if (mass <= peakMass) continue
        peak = k
        peakMass = mass
    }

    const cosines = hues.map(h => Math.cos(h * Math.PI / 180))
    const sines = hues.map(h => Math.sin(h * Math.PI / 180))
    let center = peak * (360 / HUE_BINS)
    for (let iteration = 0; iteration < MEAN_SHIFT_ITERATIONS; iteration++) {
        let x = 0
        let y = 0
        for (let j = 0; j < hues.length; j++) {
            const weight = 1 - hueDistance(hues[j], center) / HUE_WINDOW
            if (weight <= 0) continue
            x += weight * cosines[j]
            y += weight * sines[j]
        }
        if (x === 0 && y === 0) break
        center = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
    }

    let r = 0
    let g = 0
    let b = 0
    let total = 0
    for (let j = 0; j < hues.length; j++) {
        const weight = 1 - hueDistance(hues[j], center) / HUE_WINDOW
        if (weight <= 0) continue
        const i = offsets[j]
        r += weight * data[i]
        g += weight * data[i + 1]
        b += weight * data[i + 2]
        total += weight
    }
    return total > 0 ? toStableHex(r / total, g / total, b / total) : null
}

function samplePixels(bitmap: ImageBitmap): Uint8ClampedArray | null {
    const scale = bitmap.width * bitmap.height > MAX_DRAW_PIXELS
        ? MAX_SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height)
        : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, 0, 0, width, height)
    const data = ctx.getImageData(0, 0, width, height).data
    const stride = Math.ceil(Math.max(width, height) / MAX_SAMPLE_SIDE)
    if (stride === 1) return data

    const sampled: number[] = []
    for (let y = 0; y < height; y += stride) {
        for (let x = 0; x < width; x += stride) {
            const i = (y * width + x) * 4
            sampled.push(data[i], data[i + 1], data[i + 2], data[i + 3])
        }
    }
    return Uint8ClampedArray.from(sampled)
}

const iconColors = new Map<string, string>()
const storageChecked = new Set<string>()
const iconColorRequests = new Map<string, Promise<string | null>>()
const listeners = new Set<() => void>()

function storageKey(iconUrl: string): string {
    return `commColor:v${COLOR_ALGO_VERSION}:${iconUrl}`
}

function readIconColor(iconUrl: string): string | undefined {
    if (!iconColors.has(iconUrl) && !storageChecked.has(iconUrl)) {
        storageChecked.add(iconUrl)
        try {
            const stored = localStorage.getItem(storageKey(iconUrl))
            if (stored === MONOCHROME || /^#[0-9a-f]{6}$/.test(stored ?? '')) iconColors.set(iconUrl, stored)
        } catch {}
    }
    return iconColors.get(iconUrl)
}

function storeIconColor(iconUrl: string, color: string) {
    iconColors.set(iconUrl, color)
    try {
        localStorage.setItem(storageKey(iconUrl), color)
    } catch {}
    listeners.forEach(listener => listener())
}

export function peekIconColor(iconUrl: string): string | null {
    const color = readIconColor(iconUrl)
    return color && color !== MONOCHROME ? color : null
}

export function subscribeIconColors(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function getIconDominantColor(iconUrl: string): Promise<string | null> {
    const pending = iconColorRequests.get(iconUrl)
    if (pending) return pending

    const known = readIconColor(iconUrl)
    const request = known !== undefined
        ? Promise.resolve(known === MONOCHROME ? null : known)
        : fetch(iconUrl, { cache: 'no-store' })
            .then(response => response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`)))
            .then(blob => createImageBitmap(blob))
            .then(bitmap => {
                const pixels = samplePixels(bitmap)
                bitmap.close()
                if (!pixels) return null
                const color = extractDominantColor(pixels)
                storeIconColor(iconUrl, color ?? MONOCHROME)
                return color
            })
            .catch(() => null)
    iconColorRequests.set(iconUrl, request)
    return request
}
