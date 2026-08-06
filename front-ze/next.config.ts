import fs from 'node:fs';
import path from 'node:path';
import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// HEAD is either a raw SHA (detached -- what actions/checkout leaves behind) or a symbolic ref.
function resolveHead(gitDir: string): string {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head;

    const ref = head.slice(4).trim();
    const loose = path.join(gitDir, ref);
    if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim();

    // A freshly cloned or gc'd repository keeps its refs in packed-refs instead of as loose files.
    const packed = path.join(gitDir, 'packed-refs');
    if (!fs.existsSync(packed)) return '';
    for (const line of fs.readFileSync(packed, 'utf8').split('\n')) {
        const [sha, name] = line.split(' ');
        if (name === ref) return sha;
    }
    return '';
}

// Read .git directly rather than shelling out to `git`: the dev container mounts the repository's
// .git read-only but has no git binary, and plain fs works identically on the host. Walks up
// because this runs from front-ze/, while .git sits at the repository root.
function readCommitFromGitDir(start: string): string {
    for (let dir = start; ; dir = path.dirname(dir)) {
        const dotGit = path.join(dir, '.git');
        if (fs.existsSync(dotGit)) {
            // A .git *file* points elsewhere (worktrees, submodules).
            const gitDir = fs.statSync(dotGit).isDirectory()
                ? dotGit
                : path.resolve(dir, fs.readFileSync(dotGit, 'utf8').replace(/^gitdir:/, '').trim());
            return resolveHead(gitDir);
        }
        if (path.dirname(dir) === dir) return '';
    }
}

// The production image has neither .git nor a mount for it (.dockerignore excludes it), so its SHA
// arrives as the BUILD_COMMIT build arg. Empty means the footer hides the build line entirely.
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
    // Inlined at build time through both webpack and turbopack, unlike a DefinePlugin.
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
        // The global profile moved out from under /users to sit with the rest of /players.
        return [
            {
                source: '/users/:player_id/profile',
                destination: '/players/:player_id/profile',
                permanent: true,
            },
        ]
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