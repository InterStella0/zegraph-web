import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'ZE Graph',
        short_name: 'ZEGraph',
        description: 'Counter Strike 2 Zombie Escape players',
        start_url: '/',
        display: 'standalone',
        background_color: '#0A0A0AFF',
        theme_color: '#2A0528',
        icons: [
            {
                src: '/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    }
}