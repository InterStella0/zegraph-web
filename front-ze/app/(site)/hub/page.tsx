import { Metadata } from 'next';
import { Compass } from 'lucide-react';
import { Suspense } from 'react';
import { URI, formatTitle } from 'utils/generalUtils';
import { getTranslations } from 'next-intl/server';
import HubLinks, { HubLinksLoading } from './HubLinks';
import type { CommunityLink } from 'types/community';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: formatTitle(t('hubTitle')),
    description: t('hubDescription'),
    alternates: { canonical: '/hub' },
  };
}

const getLinks = (): Promise<CommunityLink[]> => fetch(URI('/community-links'), { next: { revalidate: 300 } })
  .then((res) => (res.ok ? res.json() : null))
  .then((json) => json?.data ?? [])
  .catch(() => []);

export default async function HubPage() {
  const t = await getTranslations('hub');

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="container mx-auto max-w-5xl space-y-10">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold">{t('title')}</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl">{t('description')}</p>
        </div>

        <Suspense fallback={<HubLinksLoading />}>
          <HubLinks linksPromise={getLinks()} />
        </Suspense>
      </div>
    </div>
  );
}
