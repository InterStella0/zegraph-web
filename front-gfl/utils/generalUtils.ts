import dayjs from "dayjs";
import type {Metadata} from "next";
import {MapImage} from "types/maps";
import {cookies} from "next/dist/server/request/cookies";

const API_ROOT = "/data/api"
const NEXTAPI_ROOT = "/api"
export const BACKEND_DOMAIN = "http://backend:3000"
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


export function URI(endpoint: string, backend: boolean = false): string{
    const isOnServer = typeof window === 'undefined'
    if (!backend)
        if (isOnServer) {
            return BACKEND_DOMAIN + endpoint
        } else {
            return API_ROOT + endpoint;
        }
    else
        if (isOnServer) {
            // Server-side: use absolute URL to frontend service
            return FRONTEND_URL + NEXTAPI_ROOT + endpoint;
        } else {
            // Client-side: use relative path
            return NEXTAPI_ROOT + endpoint;
        }
}

export class APIError extends Error{
    public code: number;
    public message: string;
    constructor(message: string, status: number){
        super(message)
        this.message = message
        this.code = status
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

class UserError extends APIError{
    public method: string
    constructor(method: string, message: string, status: number){
        super(`${message}`, status)
        this.method = method
    }
}
export class RendererError extends APIError{
    constructor(){
        super(`Used while rendered.`, 500)
    }
}

class RateLimited extends APIError{
    constructor(message: string){
        super(`We're being ratelimited for method ${message}`, 429)
    }
}

export class StillCalculate extends APIError{
    public method: string
    constructor(method: string){
        super(`Data is not ready`, 202)
        this.method = method
    }
}
export class AuthenticationError extends UserError{
    constructor(){
        super("authentication", `You cannot do this action!`, 403)
    }
}
export class NotFoundError extends UserError{
    constructor(){
        super("Not Found", `Not Found`, 404)
    }
}
class MaxRateLimit extends APIError{
    constructor(method: string){
        super(`Stopped attempting to retry ${method}`, 429)
    }
}
const mapAttrs = ['small', 'medium', 'large', 'extra_large']

export type GetMapImageReturn = MapImage | null

export async function getMapImage(server_id: string, mapName: string): Promise<GetMapImageReturn> {
    try {
        const result = await fetchServerUrl(server_id, `/maps/${mapName}/images`, { next: { revalidate: 86400 } })
        const domain = process.env.NEXT_PUBLIC_DOMAIN ?? "";
        for (const attr of mapAttrs) {
            if (result[attr].startsWith("/")) {
                result[attr] = domain + result[attr]
            }
        }
        return result
    } catch {
        return null
    }
}

type SelectionIntervals = '10min' | '30min' | '1hour' | '6hours' | '12hours' | '1day' | '1week' | '1month'
export function fetchServerUrl(serverId: string, endpoint: string, options = {}, errorOnStillCalculate = true){
    return fetchUrl(`/servers/${serverId}${endpoint}`, options, errorOnStillCalculate)
}
export function fetchApiServerUrl(serverId: string, endpoint: string, options = {}, errorOnStillCalculate = true){
    return fetchApiUrl(`/servers/${serverId}${endpoint}`, options, errorOnStillCalculate)
}

export async function fetchApiUrl(endpoint: string, options: any = {}, errorOnStillCalculate = true, maxRetries = 5, backoffBaseMs = 500, maxFailures = 3){
    const optionsNew = {...options, backend: true};
    return await fetchUrl(endpoint, optionsNew, errorOnStillCalculate, maxRetries, backoffBaseMs, maxFailures)
}
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export async function fetchUrl(endpoint: string, options: any = {}, errorOnStillCalculate = true, maxRetries = 5, backoffBaseMs = 500, maxFailures = 3) {
    if (process.env.NEXT_PHASE === "phase-production-build")
        throw new RendererError()

    if (options?.params) {
        endpoint = endpoint + '?' + new URLSearchParams(options.params).toString();
    }
    const isOnServer = typeof window === 'undefined';
    if (isOnServer && options?.backend) { // STRICTLY ON THE SERVER
        const cookieStore = await cookies();
        options.headers = {
            ...options.headers,
            Cookie: cookieStore.toString()
        };
    }

    const rawOutput = options?.raw_output ?? false
    const method = URI(endpoint, options?.backend)

    let rateLimitAttempts = 0;
    let failureAttempts = 0;

    while (rateLimitAttempts <= maxRetries && failureAttempts < maxFailures) {
        try {
            const response = await fetch(method, { ...options });

            if (response.status === 429) {
                if (rateLimitAttempts === maxRetries) {
                    throw new MaxRateLimit(method || 'unknown');
                }

                const retryAfter = response.headers.get('Retry-After');
                let delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoffBaseMs * (2 ** rateLimitAttempts);
                delay = Math.min(delay, 30000);

                await sleep(delay);
                rateLimitAttempts++;
                continue;
            }
            if (response.status === 401){
                throw new AuthenticationError()
            }

            if (response.status !== 200 && response.status !== 201) {
                const msg = await response.text();
                throw new APIError(msg, response.status);
            }

            if (rawOutput)
                // Raw output can't be parsed to json.
                return await response.text();
            const json = await response.json();

            if (json.code === 202){
                throw new StillCalculate(method)
            }
            if (json.code === 403){
                throw new AuthenticationError()
            }
            if (json.code === 404){
                throw new NotFoundError()
            }

            if (json.msg === "OK") {
                return json.data;
            } else {
                throw new UserError(method, json.msg, json.code);
            }

        } catch (err) {
            if (err instanceof StillCalculate && !errorOnStillCalculate){
                return err
            }
            if (err instanceof RateLimited) {
                const retry = backoffBaseMs * (2 ** rateLimitAttempts);
                await sleep(retry);
                rateLimitAttempts++;
                continue;
            }
            if (err instanceof UserError){
                throw err;
            }

            failureAttempts++;
            if (failureAttempts < maxFailures) {
                const retry = backoffBaseMs * (2 ** failureAttempts);
                await sleep(retry);
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
export function intervalToServer(interval: SelectionIntervals) {
    switch (interval) {
        case "10min": return "min10";
        case "30min": return "min30";
        case "1hour": return "hour1";
        case "6hours": return "hour6";
        case "12hours": return "hour12";
        case "1day": return "day1";
        case "1week": return "week1";
        case "1month": return "month1";
        default:
            console.warn(`Unknown interval: ${interval}`)
            return "min10"
    }
}
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    immediate?: boolean
): DebouncedFunction<T> {
    let timeout: ReturnType<typeof setTimeout> | null;

    const debounced = function (this: ThisParameterType<T>, ...args: Parameters<T>) {
        const context = this;

        const later = () => {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };

        const callNow = immediate && !timeout;

        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(later, wait);

        if (callNow) func.apply(context, args);
    };

    debounced.cancel = () => {
        if (timeout) clearTimeout(timeout);
        timeout = null;
    };

    return debounced as T & { cancel: () => void };
}


export function secondsToHours(seconds: number, locale: string = 'en-US'): string{
    return (seconds / 3600).toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})
}

export function formatHours(seconds: number, locale: string = 'en-US'): string {
    return `${secondsToHours(seconds, locale)} hrs`;
}
export function formatNumber(num: number, decimals = 0, locale: string = 'en-US'): string {
    if (isNaN(num)) return '0';

    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(num);
}

export function secondsToMins(seconds: number): string{
    return (seconds / 60).toFixed(2)
}
export const InfractionFlags = Object.freeze({
    // Issued by system
    SYSTEM: 1n << 0n,

    // Scope
    ALL_SERVERS: 1n << 1n,
    COMMUNITY: 1n << 2n,
    // Otherwise: Only Origin Server

    // Where it was issued
    VPN: 1n << 4n,
    WEB: 1n << 5n,

    // Has been removed
    INFRACTION_REMOVED: 1n << 6n,

    // Restriction
    VOICE: 1n << 7n,
    TEXT: 1n << 8n,
    BAN: 1n << 9n,
    CALL_ADMIN: 1n << 10n,
    ADMIN_CHAT: 1n << 11n,
    ITEM_BLOCK: 1n << 14n,
    AUTO_TIER: 1n << 16n,
    KNOCKBACK: 1n << 20n,

    // Time
    PERMANENT: 1n << 3n,
    SESSION: 1n << 12n,
    ONLINE_DECREMENT: 1n << 13n,
});
export function addOrdinalSuffix(num: number): string {
    let suffix = "th";
    if (num % 100 < 11 || num % 100 > 13) {
        switch (num % 10) {
            case 1: suffix = "st"; break;
            case 2: suffix = "nd"; break;
            case 3: suffix = "rd"; break;
        }
    }
    return num + suffix;
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

function flagMapForSource(source?: string): FlagBitMap {
    if (source?.includes("nide.gg")) return NIDE_FLAG_MAP;
    return DEFAULT_FLAG_MAP;
}

function normalizeFlags(raw: bigint, map: FlagBitMap): bigint {
    let out = 0n;
    for (const [rawBit, canonicalBit] of map) {
        if ((raw & rawBit) === rawBit) out |= canonicalBit;
    }
    return out;
}

export class InfractionInt {
    public value: bigint;
    constructor(value: bigint | number, source?: string) {
        this.value = normalizeFlags(BigInt(value), flagMapForSource(source));
    }

    hasFlag(flag: bigint): boolean {
        return (this.value & flag) === flag;
    }
    getAllRestrictedFlags(): string[]{
        const restrictFlags = [
            InfractionFlags.VOICE,
            InfractionFlags.TEXT,
            InfractionFlags.BAN,
            InfractionFlags.CALL_ADMIN,
            InfractionFlags.ADMIN_CHAT,
            InfractionFlags.ITEM_BLOCK,
            InfractionFlags.AUTO_TIER,
            InfractionFlags.KNOCKBACK
        ];
        return Object.entries(InfractionFlags)
            .filter(([_, flag]) => this.hasFlag(flag) && restrictFlags.includes(flag))
            .map(([name]) => name);
    }
    getAllFlags(): string[] {
        return Object.entries(InfractionFlags)
            .filter(([_, flag]) => this.hasFlag(flag))
            .map(([name]) => name);
    }
}
export function simpleRandom(min: number, max: number, isClient: boolean = true): number{
    return isClient? Math.random() * (max - min) + min: min;
}
export function formatFlagName(flagName: string): string {
    return flagName.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export function formatTitle(title: string): string{
    return `${title} | ZE Graph`
}

export const SITE_NAME = "ZE Graph"
export const TWITTER_CREATOR = "@queeniemella"

export function socialMeta(
    {title, description, url, images}:
    {title: string, description: string, url?: string, images?: string[]}
): Pick<Metadata, "openGraph" | "twitter">{
    return {
        openGraph: {
            type: "website",
            siteName: SITE_NAME,
            locale: "en_US",
            title,
            description,
            ...(url !== undefined && {url}),
            ...(images !== undefined && {images}),
        },
        twitter: {
            card: "summary_large_image",
            creator: TWITTER_CREATOR,
            title,
            description,
            ...(images !== undefined && {images}),
        },
    }
}
export function getIntervalCallback(selectedInterval: SelectionIntervals): (date: dayjs.Dayjs) => dayjs.Dayjs {
    return (date: dayjs.Dayjs) => {
        switch (selectedInterval) {
            case '10min':
                return date.add(10, 'minute');
            case '30min':
                return date.add(30, 'minute');
            case '1hour':
                return date.add(1, 'hour');
            case '6hours':
                return date.add(6, 'hour');
            case '12hours':
                return date.add(12, 'hour');
            case '1day':
                return date.add(1, 'day');
            case '1week':
                return date.add(1, 'week');
            case '1month':
                return date.add(1, 'month');
            default:
                return date.add(1, 'hour');
        }
    }
}

