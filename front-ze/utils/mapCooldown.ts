import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);

export type MapBlockers = {
    mapsLeft: number | null,
    cooldownUntil: string | null,
    opensAt: string | null,
}

const inFuture = (time: string | null | undefined): string | null =>
    time != null && dayjs(time).isAfter(dayjs()) ? time : null;

export function mapBlockers(mapLeft: number | null | undefined, cooldown: string | null | undefined, opensAt: string | null | undefined): MapBlockers {
    return {
        mapsLeft: mapLeft != null && mapLeft > 0 ? mapLeft : null,
        cooldownUntil: inFuture(cooldown),
        opensAt: inFuture(opensAt),
    };
}

export const isBlocked = (blockers: MapBlockers): boolean =>
    blockers.mapsLeft != null || blockers.cooldownUntil != null || blockers.opensAt != null;

export const isOnCooldown = (blockers: MapBlockers): boolean =>
    blockers.mapsLeft != null || blockers.cooldownUntil != null;

export function readyAt(blockers: MapBlockers): string | null {
    const times = [blockers.cooldownUntil, blockers.opensAt].filter((time): time is string => time != null);
    if (times.length === 0) return null;
    return times.reduce((latest, time) => dayjs(time).isAfter(latest) ? time : latest);
}

function minutesOf(hhmm: string): number {
    const [hours, minutes] = hhmm.split(':').map(Number);
    return hours * 60 + minutes;
}

export function localNomWindow(
    from: string | null | undefined, until: string | null | undefined,
    opensAt: string | null | undefined, closesAt: string | null | undefined,
    toDayjs: (time: string) => dayjs.Dayjs = dayjs,
): { start: dayjs.Dayjs, end: dayjs.Dayjs } | null {
    if (!from || !until || from === until) return null;
    const length = (minutesOf(until) - minutesOf(from) + 24 * 60) % (24 * 60);
    if (opensAt) {
        const start = toDayjs(opensAt);
        return {start, end: start.add(length, 'minute')};
    }
    if (closesAt) {
        const end = toDayjs(closesAt);
        return {start: end.subtract(length, 'minute'), end};
    }
    return null;
}
