'use client';

import { ReactElement, use } from 'react';
import { ExternalLink } from 'lucide-react';
import { Skeleton } from 'components/ui/skeleton';
import { useTranslations } from 'next-intl';

interface CommunityLink {
    id: string;
    name: string;
    url: string;
    description: string | null;
    sort_order: number;
    created_at: string;
}

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

export function HubLinksLoading() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[132px] w-full rounded-xl" />
            ))}
        </div>
    );
}

export default function HubLinks({
    linksPromise,
}: {
    linksPromise: Promise<CommunityLink[]>;
}): ReactElement {
    const links = use(linksPromise);
    const t = useTranslations('hub');

    if (links.length === 0) {
        return (
            <div className="text-center py-16 text-muted-foreground space-y-2">
                <p className="text-lg font-medium">{t('nothingYet')}</p>
                <p className="text-sm">{t('comingSoon')}</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {links.map((link) => (
                <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/20 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="font-semibold leading-tight group-hover:text-primary transition-colors">
                            {link.name}
                        </h2>
                        <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {link.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                            {link.description}
                        </p>
                    )}
                    <span className="text-xs text-muted-foreground/70 font-mono mt-auto pt-1 truncate">
            {hostOf(link.url)}
          </span>
                </a>
            ))}
        </div>
    );
}
