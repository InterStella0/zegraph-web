import { Metadata } from 'next';
import { Compass } from 'lucide-react';
import { Suspense } from 'react';
import ResponsiveAppBar from 'components/ui/ResponsiveAppBar';
import Footer from 'components/ui/Footer';
import getServerUser from '../getServerUser';
import { URI, formatTitle } from 'utils/generalUtils';
import { getTranslations } from 'next-intl/server';
import HubLinks, { HubLinksLoading } from './HubLinks';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: formatTitle(t('hubTitle')),
    description: t('hubDescription'),
    alternates: { canonical: '/hub' },
  };
}

interface CommunityLink {
  id: string;
  name: string;
  url: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

async function getLinks(): Promise<CommunityLink[]> {
  try {
    const res = await fetch(URI('/community-links'), { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data ?? [];
  } catch {
    return [];
  }
}

export default async function HubPage() {
  const t = await getTranslations('hub');
  const user = getServerUser();
  const linksPromise = getLinks();

  return (
    <>
      <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />

      <div className="min-h-screen py-12 px-4">
        <div className="container mx-auto max-w-5xl space-y-10">

          {/* Page header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Compass className="w-6 h-6 text-primary" />
              <h1 className="text-3xl font-bold">{t('title')}</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              {t('description')}
            </p>
          </div>

          {/* Links grid */}
          <Suspense fallback={<HubLinksLoading />}>
            <HubLinks linksPromise={linksPromise} />
          </Suspense>

        </div>
      </div>

      <Footer />
    </>
  );
}
