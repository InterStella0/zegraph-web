import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'ZE Graph',
        short_name: 'ZEGraph',
        description: 'Zombie escape statistics',
        start_url: '/',
        display: 'standalone',
        background_color: '#0A0A0AFF',
        theme_color: '#2A0528',
        icons: ['192x192', '512x512'].map(sizes => ({src: `/icon-${sizes}.png`, sizes, type: 'image/png'})),
    }
}