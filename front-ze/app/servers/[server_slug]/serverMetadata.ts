import {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import dayjs from "dayjs";
import {Server} from "types/community";
import {formatHours, formatTitle, socialMeta} from "utils/generalUtils";
import {getServerGraph, getServerSlugOrNotFound, SessionType} from "./util";

export type MetadataTranslator = Awaited<ReturnType<typeof getTranslations>>;

type ServerMeta = {
    title: string,
    description: string,
    path: string,
    social?: { images?: string[] | null, noTwitter?: boolean },
}

export async function serverMetadata<P extends { server_slug: string }>(
    params: Promise<P> | P,
    build: (server: Server, t: MetadataTranslator, params: P) => Promise<ServerMeta | Metadata> | ServerMeta,
): Promise<Metadata> {
    const resolved = await params;
    const server = await getServerSlugOrNotFound(resolved.server_slug);
    const t = await getTranslations('metadata');
    const meta = await build(server, t, resolved);
    if (!('path' in meta)) return meta;

    const title = formatTitle(meta.title);
    const {description, social} = meta;
    return {
        title,
        description,
        alternates: {
            canonical: `/servers/${server.gotoLink}${meta.path}`,
        },
        ...(social && socialMeta({title, description, ...social})),
    }
}

export function metadataFallback(
    error: any, kind: SessionType, title: string, server: Server, t: MetadataTranslator, notFoundCodes: number[] = [404],
): Metadata {
    if (error.code === 202) {
        return {
            title,
            description: t(kind === "map" ? 'mapCalculating' : 'playerCalculating'),
        }
    }
    if (notFoundCodes.includes(error.code)) {
        return {
            title: "ZE Graph",
            description: t(kind === "map" ? 'viewMapActivities' : 'viewPlayerActivities', {name: server.community_name}),
        };
    }
    return {}
}

export async function sessionSummary(
    t: MetadataTranslator,
    info: { started_at: string, ended_at: string | null },
    keys: [ended: string, ongoing: string],
    serverId: string, sessionId: string, objectId: string, type: SessionType,
): Promise<string> {
    let description = info.ended_at
        ? t(keys[0], {hours: formatHours(dayjs(info.ended_at).diff(dayjs(info.started_at), 'seconds', true))})
        : t(keys[1], {hours: formatHours(dayjs().diff(dayjs(info.started_at), 'seconds', true))})
    try{
        const serverCounts = await getServerGraph(serverId, sessionId, objectId, type)
        const playerCounts = serverCounts.map(e => e.player_count)
        const [min, max] = [Math.min(...playerCounts), Math.max(...playerCounts)]
        description += ' ' + t('playerCountRange', {min, max})
    }catch (error){}
    return description
}
