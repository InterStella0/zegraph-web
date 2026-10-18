import fs from 'node:fs';
import path from 'node:path';
import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

function resolveHead(gitDir: string): string {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head;

    const ref = head.slice(4).trim();
    const loose = path.join(gitDir, ref);
    if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim();

    const packed = path.join(gitDir, 'packed-refs');
    if (!fs.existsSync(packed)) return '';
    for (const line of fs.readFileSync(packed, 'utf8').split('\n')) {
        const [sha, name] = line.split(' ');
        if (name === ref) return sha;
    }
    return '';
}

function readCommitFromGitDir(start: string): string {
    for (let dir = start; ; dir = path.dirname(dir)) {
        const dotGit = path.join(dir, '.git');
        if (fs.existsSync(dotGit)) {
            const gitDir = fs.statSync(dotGit).isDirectory()
                ? dotGit
                : path.resolve(dir, fs.readFileSync(dotGit, 'utf8').replace(/^gitdir:/, '').trim());
            return resolveHead(gitDir);
        }
        if (path.dirname(dir) === dir) return '';
    }
}

function resolveBuildCommit(): string {
    const fromEnv = process.env.BUILD_COMMIT?.trim();
    if (fromEnv) return fromEnv;
    try {
        return readCommitFromGitDir(process.cwd());
    } catch {
        return '';
    }
}

const nextConfig: NextConfig = {
    output: 'standalone',
    allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
    env: {
        NEXT_PUBLIC_BUILD_COMMIT: resolveBuildCommit(),
        NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    },
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
    async redirects() {
        return [
            {
                source: '/users/:player_id/profile',
                destination: '/players/:player_id/profile',
                permanent: true,
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
        minimumCacheTTL: 86400,
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
        viewTransition: true,
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
        config.module.rules.push({
            test: /\.svg$/i,
            use: ["@svgr/webpack"],
        });

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