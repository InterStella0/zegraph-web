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
    typescript: { ignoreBuildErrors: true },
    async headers() {
        const origin = process.env.R2_PUBLIC_BASE_URL
        if (!origin) return []
        return [{
            source: '/:path*',
            headers: [
                { key: 'Access-Control-Allow-Origin', value: origin },
                { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
                { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
            ],
        }]
    },
    async redirects() {
        return [{ source: '/users/:player_id/profile', destination: '/players/:player_id/profile', permanent: true }]
    },
    skipTrailingSlashRedirect: true,
    turbopack: { rules: { '*.svg': { loaders: ['@svgr/webpack'], as: '*.js' } } },
    logging: { fetches: { fullUrl: true } },
    images: {
        minimumCacheTTL: 86400,
        remotePatterns: [
            ...['localhost:3000', 'localhost', '127.0.0.1:3000', '127.0.0.1', '::1'].map(hostname => ({ hostname })),
            ...['zegraph.xyz', 'avatars.steamstatic.com', 'flagcdn.com', 'bans.gflclan.com']
                .map(hostname => ({ protocol: 'https' as const, hostname })),
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
        config.module.rules.push({ test: /\.svg$/i, use: ["@svgr/webpack"] });
        if (!isServer) {
            const group = (name: string, packages: string) =>
                ({ name, test: new RegExp(`[\\\\/]node_modules[\\\\/](${packages})[\\\\/]`), priority: 10 });
            config.optimization.splitChunks = {
                chunks: 'all',
                cacheGroups: {
                    charts: group('charts', 'chart\\.js|react-chartjs-2'),
                    leaflet: group('leaflet', 'leaflet|react-leaflet'),
                    radix: group('radix-ui', '@radix-ui'),
                },
            };
        }
        return config;
    },
};

export default withNextIntl(nextConfig);