
export const COLOR_ALGO_VERSION = 1

const SAMPLE_SIZE = 32
const ALPHA_THRESHOLD = 128

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

// Bucket center depends only on the bucket index, never on the raw pixels, so any
// two runs that agree on the winning bucket produce byte-identical output.
function bucketCenter(key: number): [number, number, number] {
    return [
        (((key >> 6) & 7) << 5) + 16,
        (((key >> 3) & 7) << 5) + 16,
        ((key & 7) << 5) + 16,
    ]
}

/**
 * Dominant color of raw RGBA pixel data (expected: 32x32 ImageData.data).
 * Canvas readback differs across browsers by a few units per channel, so pixels are
 * quantized into 32-step buckets: jitter only moves pixels sitting on a bucket
 * boundary, and large icon regions aggregate into one bucket, keeping the winner
 * stable. Ties break toward the lower bucket index. Returns null if every pixel
 * is transparent.
 */
export function extractDominantColor(data: Uint8ClampedArray): string | null {
    const counts = new Uint32Array(512)
    let opaque = 0
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < ALPHA_THRESHOLD) continue
        opaque++
        counts[((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5)]++
    }
    if (opaque === 0) return null

    const pickWinner = (accept: (s: number, l: number) => boolean): number => {
        let winner = -1
        let winnerCount = 0
        for (let key = 0; key < 512; key++) {
            if (counts[key] <= winnerCount) continue
            const [r, g, b] = bucketCenter(key)
            const [, s, l] = rgbToHsl(r, g, b)
            if (!accept(s, l)) continue
            winner = key
            winnerCount = counts[key]
        }
        return winner
    }

    // Prefer a vibrant bucket; fall back to any bucket for grayscale icons.
    let winner = pickWinner((s, l) => s >= 0.25 && l >= 0.15 && l <= 0.85)
    if (winner < 0) winner = pickWinner(() => true)

    const [r, g, b] = bucketCenter(winner)
    const [h, s, l] = rgbToHsl(r, g, b)
    return hslToHex(h, s, Math.min(0.7, Math.max(0.3, l)))
}

const iconColorCache = new Map<string, Promise<string | null>>()

/**
 * Dominant color of a remote icon. Browser only. Resolves null when the color
 * cannot be extracted (load failure, or a canvas tainted because the icon host
 * does not serve CORS headers) — callers should fall back to nameHashColor.
 * Results are deduped in-memory and persisted in localStorage per icon URL.
 */
export function getIconDominantColor(iconUrl: string): Promise<string | null> {
    const cached = iconColorCache.get(iconUrl)
    if (cached) return cached

    const storageKey = `commColor:v${COLOR_ALGO_VERSION}:${iconUrl}`
    let stored: string | null = null
    try {
        stored = localStorage.getItem(storageKey)
    } catch {}
    if (stored) {
        const resolved = Promise.resolve<string | null>(stored)
        iconColorCache.set(iconUrl, resolved)
        return resolved
    }

    const promise = new Promise<string | null>(resolve => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.decoding = 'async'
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas')
                canvas.width = SAMPLE_SIZE
                canvas.height = SAMPLE_SIZE
                const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
                if (!ctx) return resolve(null)
                ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
                const pixels = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
                const color = extractDominantColor(pixels)
                if (color) {
                    try {
                        localStorage.setItem(storageKey, color)
                    } catch {}
                }
                resolve(color)
            } catch {
                resolve(null)
            }
        }
        img.onerror = () => resolve(null)
        img.src = iconUrl
    })
    iconColorCache.set(iconUrl, promise)
    return promise
}

/**
 * One-call fallback chain: `color` is always available synchronously (name hash);
 * `promise` upgrades to the icon's dominant color when an icon exists and we're in
 * a browser, resolving to the name-hash color if extraction fails.
 */
export function getCommunityColor(
    icon_url: string | null | undefined,
    name: string
): { color: string; promise: Promise<string> | null } {
    const color = nameHashColor(name)
    if (!icon_url || typeof window === 'undefined') {
        return { color, promise: null }
    }
    return {
        color,
        promise: getIconDominantColor(icon_url).then(c => c ?? color),
    }
}
