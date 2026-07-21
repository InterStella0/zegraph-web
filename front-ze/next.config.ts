import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
    output: 'standalone',
    typescript: {
        ignoreBuildErrors: true,
    },
    async headers() {
        const base_url = process.env.R2_PUBLIC_BASE_URL
        if (base_url)
            return [
                {
                    source: '/:path*',
                    headers: [
                        { key: 'Access-Control-Allow-Origin', value: process.env.R2_PUBLIC_BASE_URL },
                        { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
                        { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
                    ],
                },
            ]
        return []
    },
    async rewrites() {
        return [
            {
                source: '/cat/static/:path*',
                destination: 'https://eu-assets.i.posthog.com/static/:path*',
            },
            {
                source: '/cat/:path*',
                destination: 'https://eu.i.posthog.com/:path*',
            },
        ]
    },
    skipTrailingSlashRedirect: true,
    turbopack: {
        rules: {
            '*.svg': {
                loaders: ['@svgr/webpack'],
                as: '*.js',
            },
        },
    },
    logging: {
        fetches: {
            fullUrl: true
        }
    },
    images: {
        remotePatterns: [
            {
                hostname: 'localhost:3000',
            },
            {
                hostname: 'localhost',
            },
            {
                hostname: '127.0.0.1:3000',
            },
            {
                hostname: '127.0.0.1',
            },
            {
                hostname: '::1',
            },
            {
                protocol: 'https',
                hostname: 'zegraph.xyz'
            },
            {
                protocol: 'https',
                hostname: 'avatars.steamstatic.com',
            },
            {
                protocol: 'https',
                hostname: 'flagcdn.com',
            },
            {
                protocol: 'https',
                hostname: 'bans.gflclan.com',
            }
        ]
    },
    experimental: {
        optimizePackageImports: [
            'lucide-react',
            '@radix-ui/react-avatar',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-popover',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-sheet',
            'chart.js',
            'react-chartjs-2'
        ],
    },
    webpack: (config, { isServer }) => {
        // SVG loader for webpack builds
        config.module.rules.push({
            test: /\.svg$/i,
            use: ["@svgr/webpack"],
        });

        // Add chunk splitting for better caching
        if (!isServer) {
            config.optimization.splitChunks = {
                chunks: 'all',
                cacheGroups: {
                    charts: {
                        test: /[\\/]node_modules[\\/](chart\.js|react-chartjs-2)[\\/]/,
                        name: 'charts',
                        priority: 10,
                    },
                    leaflet: {
                        test: /[\\/]node_modules[\\/](leaflet|react-leaflet)[\\/]/,
                        name: 'leaflet',
                        priority: 10,
                    },
                    radix: {
                        test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
                        name: 'radix-ui',
                        priority: 10,
                    },
                },
            };
        }

        return config;
    },
};

export default withNextIntl(nextConfig);