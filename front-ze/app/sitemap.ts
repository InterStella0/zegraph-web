import type { MetadataRoute } from 'next'
import {DOMAIN, fetchUrl, RendererError} from 'utils/generalUtils'
import { oneHour } from './servers/[server_slug]/util'
export const revalidate = 1800;

type SitemapEntry = MetadataRoute.Sitemap[number]

function sanitizeUrl(str) {
    return str.trim()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
}

function entry(path: string, changeFrequency: SitemapEntry['changeFrequency'], priority: number, lastModified?: string | null): SitemapEntry {
    return {url: `${DOMAIN}${path}`, changeFrequency, priority, ...(lastModified && { lastModified })}
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    let data: SitemapData
    try {
        data = await fetchUrl(`/sitemap-data`, {
            next: { revalidate: oneHour }
        })
    } catch (error) {
        if (!(error instanceof RendererError))
            console.error('Error fetching sitemap data:', error)
        return []
    }

    const urls: MetadataRoute.Sitemap = [entry('', 'hourly', 1.0), entry('/maps', 'daily', 1.0)]

    for (const server of data.servers) {
        const slug = server.readable_link ?? server.server_id
        urls.push(
            entry(`/servers/${slug}`, 'hourly', 1.0),
            entry(`/servers/${slug}/maps`, 'daily', 1.0),
            entry(`/servers/${slug}/players`, 'daily', 1.0),
        )
    }

    const globalMaps = new Map<string, string | null>()
    for (const map of data.maps) {
        const map_name = sanitizeUrl(map.map_name)
        if (map_name == "")
            continue

        const slug = map.server_readable_link ?? map.server_id
        urls.push(entry(`/servers/${slug}/maps/${map_name}`, 'weekly', 0.9, map.last_played))

        const latest = globalMaps.get(map_name) ?? null
        globalMaps.set(map_name, latest && (!map.last_played || latest > map.last_played) ? latest : map.last_played)
    }
    for (const [map_name, lastPlayed] of globalMaps)
        urls.push(entry(`/maps/${map_name}`, 'weekly', 0.9, lastPlayed))

    for (const player of data.players) {
        const slug = player.server_readable_link ?? player.server_id
        urls.push(entry(`/servers/${slug}/players/${player.player_id}`, 'weekly', 0.7, player.recent_online))
    }

    return urls
}
