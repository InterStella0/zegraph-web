import {InfractionFlags, InfractionInt} from "utils/generalUtils.ts";

/** A row exactly as `/events/history` and `/events/data-updates` send it. */
export type RawLiveEvent = { channel: string, payload: string };

export type LiveEventKind = 'player' | 'map' | 'infraction';

type LiveEventBase = {
    key: string,
    serverId: string | null,
    at: number,
    /** When the stream delivered it; null for events loaded from history. */
    arrivedAt: number | null,
};

export type PlayerLiveEvent = LiveEventBase & {
    kind: 'player',
    action: 'join' | 'leave' | 'name' | string,
    playerId: string,
    name: string,
};

export type MapLiveEvent = LiveEventBase & {
    kind: 'map',
    map: string,
    playerCount: number,
    startedAt: number,
    endedAt: number | null,
};

export type InfractionPunishment = 'ban' | 'silence' | 'mute' | 'gag' | 'restrict';

export type InfractionLiveEvent = LiveEventBase & {
    kind: 'infraction',
    isNew: boolean,
    removed: boolean,
    punishment: InfractionPunishment,
    /** Restriction flag names other than the ones folded into `punishment`. */
    extraFlags: string[],
    reason: string | null,
    adminName: string | null,
    adminAvatarId: string | null,
    playerId: string | null,
    playerName: string | null,
};

export type LiveEvent = PlayerLiveEvent | MapLiveEvent | InfractionLiveEvent;

const CHANNEL_KIND: Record<string, LiveEventKind> = {
    player_activity: 'player',
    map_changed: 'map',
    map_update: 'map',
    infraction_new: 'infraction',
    infraction_update: 'infraction',
};

// The same row always arrives as the same channel + payload, from the stream and the history alike.
export const rawEventKey = (event: RawLiveEvent) => `${event.channel}\u0000${event.payload}`;

/** Unix seconds, unix millis and ISO strings all show up across event sources. */
function toMillis(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? null : parsed;
}

const RESTRICTION_FLAGS = new Set(['VOICE', 'TEXT', 'BAN']);

function punishmentOf(flags: InfractionInt): InfractionPunishment {
    if (flags.hasFlag(InfractionFlags.BAN)) return 'ban';
    const voice = flags.hasFlag(InfractionFlags.VOICE);
    const text = flags.hasFlag(InfractionFlags.TEXT);
    if (voice && text) return 'silence';
    if (voice) return 'mute';
    if (text) return 'gag';
    return 'restrict';
}

function parseInfraction(channel: string, row, base: Omit<LiveEventBase, 'serverId' | 'at'>): InfractionLiveEvent {
    const payload = row.payload ?? {};
    // nide.gg sends the admin as a bare name and the player as top-level steam fields.
    const admin = typeof payload.admin === 'string' ? { admin_name: payload.admin } : payload.admin;
    const flags = new InfractionInt(payload.flags ?? 0, row.source);
    const punishment = punishmentOf(flags);
    const reason = payload.reason || null;
    const adminName = admin?.admin_name ?? null;

    return {
        ...base,
        // Infractions get re-saved without visible changes (sync bookkeeping), so a repeat that would
        // render identically collapses into the copy already shown.
        key: [channel, row.infraction_id, flags.value, reason, adminName].join('\u0000'),
        kind: 'infraction',
        serverId: payload.server_id ?? null,
        // The row only records when the infraction was issued, so an update is dated by its arrival when streamed.
        at: (channel === 'infraction_update' ? base.arrivedAt : null)
            ?? toMillis(row.created) ?? toMillis(payload.created) ?? toMillis(payload.invoked_on) ?? Date.now(),
        isNew: channel === 'infraction_new',
        removed: flags.hasFlag(InfractionFlags.INFRACTION_REMOVED),
        punishment,
        extraFlags: flags.getAllRestrictedFlags().filter(flag => !RESTRICTION_FLAGS.has(flag)),
        reason,
        adminName,
        adminAvatarId: admin?.avatar_id ?? null,
        playerId: payload.player?.gs_id ?? payload.steam64_id ?? null,
        playerName: payload.player?.gs_name ?? payload.player_name ?? null,
    };
}

/** Parses once on arrival so rows never touch raw JSON; returns null for anything unrecognised. */
export function parseLiveEvent(raw: RawLiveEvent, arrivedAt: number | null): LiveEvent | null {
    const kind = CHANNEL_KIND[raw.channel];
    if (!kind) return null;

    try {
        const row = JSON.parse(raw.payload);
        const base = { key: rawEventKey(raw), arrivedAt };

        if (kind === 'player') {
            return {
                ...base,
                kind,
                serverId: row.server_id ?? null,
                at: toMillis(row.created_at) ?? arrivedAt ?? Date.now(),
                action: row.event_name,
                playerId: row.player_id,
                name: row.event_value,
            };
        }
        if (kind === 'map') {
            const startedAt = toMillis(row.started_at) ?? arrivedAt ?? Date.now();
            const endedAt = toMillis(row.ended_at);
            return {
                ...base,
                kind,
                serverId: row.server_id ?? null,
                // An update without an end is a mid-match change, so the stream's clock is the closest we have.
                at: endedAt ?? (raw.channel === 'map_update' ? arrivedAt : null) ?? startedAt,
                map: row.map,
                playerCount: row.player_count ?? 0,
                startedAt,
                endedAt,
            };
        }
        return parseInfraction(raw.channel, row, base);
    } catch (error) {
        console.warn('Dropping unreadable live event', raw, error);
        return null;
    }
}

export const MAX_EVENTS = 2000;

/** Keeps the first copy of every event, newest first, capped at MAX_EVENTS. */
export function mergeEvents(...lists: LiveEvent[][]): LiveEvent[] {
    const seen = new Set<string>();
    const merged: LiveEvent[] = [];
    for (const list of lists) {
        for (const event of list) {
            if (seen.has(event.key)) continue;
            seen.add(event.key);
            merged.push(event);
            if (merged.length === MAX_EVENTS) return merged;
        }
    }
    return merged;
}
