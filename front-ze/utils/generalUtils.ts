import dayjs from "dayjs";
import type {Metadata} from "next";
import {MapImage} from "types/maps";
import {cookies} from "next/dist/server/request/cookies";
import {notFound} from "next/navigation";

const API_ROOT = "/data/api"
const NEXTAPI_ROOT = "/api"
export const BACKEND_DOMAIN = process.env.BACKEND_URL || "http://backend:3000"
export const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://frontend:3000"
export const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? "https://zegraph.xyz";
export const CONTACT_EMAIL = "contact@queeniemella.cc";
export const ICE_FILE_ENDPOINT = "https://bans.gflclan.com/file/uploads/{}/avatar.webp"

export const REGION_COLORS = {
    "Asia + EU": "rgba(255, 99, 132, 0.3)",
    "EU + NA": "rgba(54, 162, 235, 0.3)",
    "NA + EU": "rgba(75, 192, 192, 0.3)",
    "NA + Asia": "rgba(255, 206, 86, 0.3)",
};

const isServer = () => typeof window === 'undefined'

// Anonymous reads go straight to the backend; `backend` routes through the Next API so the session is attached.
export function URI(endpoint: string, backend: boolean = false): string {
    if (backend) return (isServer() ? FRONTEND_URL : '') + NEXTAPI_ROOT + endpoint
    return (isServer() ? BACKEND_DOMAIN : API_ROOT) + endpoint
}

export class APIError extends Error {
    constructor(message: string, public code: number) {
        super(message)
        Error.captureStackTrace?.(this, this.constructor)
    }
}
class UserError extends APIError {
    constructor(public method: string, message: string, status: number) {
        super(`${method}: ${message}`, status)
    }
}
export class RendererError extends APIError {
    constructor() { super(`Used while rendered.`, 500) }
}
export class StillCalculate extends APIError {
    constructor(public method: string) { super(`Data is not ready`, 202) }
}
export class AuthenticationError extends UserError {
    constructor() { super("authentication", `You cannot do this action!`, 403) }
}
export class NotFoundError extends UserError {
    constructor() { super("Not Found", `Not Found`, 404) }
}
class MaxRateLimit extends APIError {
    constructor(method: string) { super(`Stopped attempting to retry ${method}`, 429) }
}

export type GetMapImageReturn = MapImage | null

export function withImageDomain(image: MapImage): MapImage {
    const domain = process.env.NEXT_PUBLIC_DOMAIN ?? "";
    for (const attr of ['small', 'medium', 'large', 'extra_large'])
        if (image[attr].startsWith("/")) image[attr] = domain + image[attr]
    return image
}

export function map3dViewerUrl(mapName: string): string {
    return `https://maps.cybo.dev/?map=${encodeURIComponent(mapName)}`
}

export async function getMapImage(server_id: string, mapName: string): Promise<GetMapImageReturn> {
    try {
        return withImageDomain(await fetchServerUrl(server_id, `/maps/${mapName}/images`, { next: { revalidate: 86400 } }))
    } catch {
        return null
    }
}

export function fetchServerUrl(serverId: string, endpoint: string, options = {}, errorOnStillCalculate = true) {
    return fetchUrl(`/servers/${serverId}${endpoint}`, options, errorOnStillCalculate)
}
export function fetchApiServerUrl(serverId: string, endpoint: string, options = {}, errorOnStillCalculate = true) {
    return fetchApiUrl(`/servers/${serverId}${endpoint}`, options, errorOnStillCalculate)
}
export function fetchMapUrl(serverId: string | null, mapName: string, endpoint: string, options = {}, errorOnStillCalculate = true) {
    return serverId
        ? fetchServerUrl(serverId, `/maps/${mapName}${endpoint}`, options, errorOnStillCalculate)
        : fetchUrl(`/maps/${encodeURIComponent(mapName)}${endpoint}`, options, errorOnStillCalculate)
}
export function fetchApiUrl(endpoint: string, options: any = {}, errorOnStillCalculate = true, maxRetries = 5, backoffBaseMs = 500, maxFailures = 3) {
    return fetchUrl(endpoint, {...options, backend: true}, errorOnStillCalculate, maxRetries, backoffBaseMs, maxFailures)
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Swallows a rejection, for optional data that a page renders without. */
export const orNull = <T,>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null)

/** Turns a 404 into the route's not-found page; other errors still throw. */
export const orNotFound = <T,>(promise: Promise<T>): Promise<T> => promise.catch(error => {
    if (error?.code === 404) notFound()
    throw error
})

/** Fetch options that bypass the browser and CDN caches. */
export const NO_CACHE = { cache: "no-store", headers: { "Cache-Control": "no-cache" } } as const;

export const range = (length: number): number[] => Array.from({length}, (_, i) => i)

const SESSION_COOKIE = /^(__Secure-)?next-auth\.session-token(\.\d+)?$/;

export async function hasSession(): Promise<boolean> {
    if (!isServer()) return document.documentElement.dataset.auth === "1";
    return (await cookies()).getAll().some(cookie => SESSION_COOKIE.test(cookie.name));
}

const JSON_ERRORS: Record<number, (method: string) => APIError> = {
    202: method => new StillCalculate(method),
    403: () => new AuthenticationError(),
    404: () => new NotFoundError(),
}

export async function fetchUrl(endpoint: string, options: any = {}, errorOnStillCalculate = true, maxRetries = 5, backoffBaseMs = 500, maxFailures = 3) {
    if (process.env.NEXT_PHASE === "phase-production-build")
        throw new RendererError()

    if (options?.params)
        endpoint += '?' + new URLSearchParams(options.params).toString();
    const isGet = (options?.method ?? "GET").toUpperCase() === "GET";
    if (options?.backend && isGet && !(await hasSession()))
        options = {...options, backend: false};
    if (isServer() && options?.backend)
        options.headers = {...options.headers, Cookie: (await cookies()).toString()};

    const method = URI(endpoint, options?.backend)
    let rateLimitAttempts = 0;
    let failureAttempts = 0;

    while (rateLimitAttempts <= maxRetries && failureAttempts < maxFailures) {
        try {
            const response = await fetch(method, { ...options });

            if (response.status === 429) {
                if (rateLimitAttempts === maxRetries) throw new MaxRateLimit(method || 'unknown');
                const retryAfter = response.headers.get('Retry-After');
                await sleep(Math.min(retryAfter ? parseInt(retryAfter, 10) * 1000 : backoffBaseMs * (2 ** rateLimitAttempts), 30000));
                rateLimitAttempts++;
                continue;
            }
            if (response.status === 401) throw new AuthenticationError()
            if (response.status !== 200 && response.status !== 201)
                throw new APIError(await response.text(), response.status);
            if (options?.raw_output) return await response.text();

            const json = await response.json();
            const jsonError = JSON_ERRORS[json.code]
            if (jsonError) throw jsonError(method)
            if (json.msg === "OK") return json.data;
            throw new UserError(method, json.msg, json.code);
        } catch (err) {
            if (err instanceof StillCalculate && !errorOnStillCalculate) return err
            if (err instanceof UserError) throw err;
            if (++failureAttempts < maxFailures) {
                await sleep(backoffBaseMs * (2 ** failureAttempts));
                continue;
            }
            throw err;
        }
    }
    throw new MaxRateLimit(method || 'unknown');
}

export function getFlagUrl(countryCode: string): string {
    return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;
}

type SelectionIntervals = '10min' | '30min' | '1hour' | '6hours' | '12hours' | '1day' | '1week' | '1month'
const INTERVALS: Record<SelectionIntervals, [server: string, amount: number, unit: dayjs.ManipulateType]> = {
    '10min': ['min10', 10, 'minute'],
    '30min': ['min30', 30, 'minute'],
    '1hour': ['hour1', 1, 'hour'],
    '6hours': ['hour6', 6, 'hour'],
    '12hours': ['hour12', 12, 'hour'],
    '1day': ['day1', 1, 'day'],
    '1week': ['week1', 1, 'week'],
    '1month': ['month1', 1, 'month'],
}

export function intervalToServer(interval: SelectionIntervals) {
    if (INTERVALS[interval]) return INTERVALS[interval][0]
    console.warn(`Unknown interval: ${interval}`)
    return "min10"
}

export function getIntervalCallback(selectedInterval: SelectionIntervals): (date: dayjs.Dayjs) => dayjs.Dayjs {
    const [, amount, unit] = INTERVALS[selectedInterval] ?? ['', 1, 'hour'] as const
    return date => date.add(amount, unit)
}

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): DebouncedFunction<T> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
    debounced.cancel = () => clearTimeout(timeout);
    return debounced as DebouncedFunction<T>;
}

export function secondsToHours(seconds: number, locale: string = 'en-US'): string {
    return (seconds / 3600).toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})
}

export function formatHours(seconds: number, locale: string = 'en-US'): string {
    return `${secondsToHours(seconds, locale)} hrs`;
}

export function formatNumber(num: number, decimals = 0, locale: string = 'en-US'): string {
    if (isNaN(num)) return '0';
    return new Intl.NumberFormat(locale, {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(num);
}

export function secondsToMins(seconds: number): string {
    return (seconds / 60).toFixed(2)
}

export const InfractionFlags = Object.freeze({
    SYSTEM: 1n << 0n,

    ALL_SERVERS: 1n << 1n,
    COMMUNITY: 1n << 2n,

    VPN: 1n << 4n,
    WEB: 1n << 5n,

    INFRACTION_REMOVED: 1n << 6n,

    VOICE: 1n << 7n,
    TEXT: 1n << 8n,
    BAN: 1n << 9n,
    CALL_ADMIN: 1n << 10n,
    ADMIN_CHAT: 1n << 11n,
    ITEM_BLOCK: 1n << 14n,
    AUTO_TIER: 1n << 16n,
    KNOCKBACK: 1n << 20n,

    PERMANENT: 1n << 3n,
    SESSION: 1n << 12n,
    ONLINE_DECREMENT: 1n << 13n,
});

const RESTRICT_FLAGS = new Set(['VOICE', 'TEXT', 'BAN', 'CALL_ADMIN', 'ADMIN_CHAT', 'ITEM_BLOCK', 'AUTO_TIER', 'KNOCKBACK']);

function ordinalSuffix(num: number): string {
    const tens = num % 100
    return tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][num % 10] ?? "th";
}
export function addOrdinalSuffix(num: number): string {
    return num + ordinalSuffix(num);
}
export function formatOrdinal(num: number, locale: string = 'en-US'): string {
    return num.toLocaleString(locale) + ordinalSuffix(num);
}

type FlagBitMap = ReadonlyArray<readonly [bigint, bigint]>;

const DEFAULT_FLAG_MAP: FlagBitMap = Object.values(InfractionFlags).map(f => [f, f] as const);

const NIDE_FLAG_MAP: FlagBitMap = [
    [1n << 0n, InfractionFlags.BAN],
    [1n << 1n, InfractionFlags.VOICE],
    [1n << 2n, InfractionFlags.TEXT],
    [1n << 3n, InfractionFlags.ITEM_BLOCK],
    [1n << 4n, InfractionFlags.KNOCKBACK],
];

export class InfractionInt {
    public value: bigint = 0n;
    constructor(value: bigint | number, source?: string) {
        const raw = BigInt(value)
        for (const [rawBit, canonicalBit] of source?.includes("nide.gg") ? NIDE_FLAG_MAP : DEFAULT_FLAG_MAP)
            if ((raw & rawBit) === rawBit) this.value |= canonicalBit;
    }

    hasFlag(flag: bigint): boolean {
        return (this.value & flag) === flag;
    }
    getAllRestrictedFlags(): string[] {
        return this.getAllFlags().filter(name => RESTRICT_FLAGS.has(name));
    }
    getAllFlags(): string[] {
        return Object.entries(InfractionFlags).filter(([, flag]) => this.hasFlag(flag)).map(([name]) => name);
    }
}

export function simpleRandom(min: number, max: number, isClient: boolean = true): number {
    return isClient ? Math.random() * (max - min) + min : min;
}
export function formatFlagName(flagName: string): string {
    return flagName.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export function formatTitle(title: string): string {
    return `${title} | ZE Graph`
}

export function socialMeta(
    {title, description, url, images, noTwitter}:
    {title: string, description: string, url?: string, images?: string[], noTwitter?: boolean}
): Pick<Metadata, "openGraph" | "twitter"> {
    const shared = {title, description, ...(images !== undefined && {images})}
    return {
        openGraph: {type: "website", siteName: "ZE Graph", locale: "en_US", ...shared, ...(url !== undefined && {url})},
        twitter: noTwitter ? {} : {card: "summary_large_image", creator: "@queeniemella", ...shared},
    }
}
