import type { MetadataRoute } from 'next'
import {DOMAIN, fetchUrl, RendererError} from 'utils/generalUtils'
import { oneHour } from './servers/[server_slug]/util'
export const revalidate = 1800;

function sanitizeUrl(str) {
    return str.trim()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
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

    const urls: MetadataRoute.Sitemap = []
    urls.push({
        url: `${DOMAIN}`,
        changeFrequency: 'hourly',
        priority: 1.0,
    })

    for (const server of data.servers) {
        const slug = server.readable_link ?? server.server_id

        urls.push({
            url: `${DOMAIN}/servers/${slug}`,
            changeFrequency: 'hourly',
            priority: 1.0,
        })

        urls.push({
            url: `${DOMAIN}/servers/${slug}/maps`,
            changeFrequency: 'daily',
            priority: 1.0,
        })

        urls.push({
            url: `${DOMAIN}/servers/${slug}/players`,
            changeFrequency: 'daily',
            priority: 1.0,
        })
    }

    for (const map of data.maps) {
        const map_name = sanitizeUrl(map.map_name).trim()
        if (map_name.indexOf("<") != -1 || map_name.indexOf(">") != -1)
            continue
        if (map_name == "")
            continue

        const slug = map.server_readable_link ?? map.server_id
        urls.push({
            url: `${DOMAIN}/servers/${slug}/maps/${map_name}`,
            changeFrequency: 'weekly',
            priority: 0.9,
            ...(map.last_played && { lastModified: map.last_played }),
        })
    }

    for (const player of data.players) {
        const slug = player.server_readable_link ?? player.server_id
        urls.push({
            url: `${DOMAIN}/servers/${slug}/players/${player.player_id}`,
            changeFrequency: 'weekly',
            priority: 0.7,
            ...(player.recent_online && { lastModified: player.recent_online }),
        })
    }

    for (const guide of data.guides) {
        const map_name = sanitizeUrl(guide.map_name).trim()
        if (guide.server_id) {
            const slug = guide.server_readable_link ?? guide.server_id
            urls.push({
                url: `${DOMAIN}/servers/${slug}/maps/${map_name}/guides/${guide.slug}`,
                changeFrequency: 'weekly',
                priority: 0.8,
                lastModified: guide.updated_at,
            })
        } else {
            urls.push({
                url: `${DOMAIN}/maps/${map_name}/guides/${guide.slug}`,
                changeFrequency: 'weekly',
                priority: 0.8,
                lastModified: guide.updated_at,
            })
        }
    }

    return urls
}
