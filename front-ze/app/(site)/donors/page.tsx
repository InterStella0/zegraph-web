import { Metadata } from 'next';
import { Suspense } from 'react';
import { Heart, Server, Globe, ExternalLink } from 'lucide-react';
import { Button } from 'components/ui/button';
import { URI } from 'utils/generalUtils';
import { getTranslations, getLocale } from 'next-intl/server';
import { getTopSupporters, getRecentSupporters } from 'utils/supporters';
import DonorsBoard, { DonorsBoardLoading } from './DonorsBoard';
import type { SpecialThanks } from 'types/community';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('donorsTitle'),
    description: t('donorsDescription'),
    alternates: { canonical: '/donors' },
  };
}

const getSpecialThanks = (): Promise<SpecialThanks[]> => fetch(URI('/special-thanks'), { next: { revalidate: 300 } })
  .then((res) => (res.ok ? res.json() : null))
  .then((json) => json?.data ?? [])
  .catch(() => []);

export default async function DonatePage() {
  const t = await getTranslations('donors');
  const locale = await getLocale();
  const perks = [
    { icon: <span className="text-base">🚫</span>, title: t('noAds'), description: t('noAdsDesc') },
    { icon: <Server className="w-4 h-4 text-primary" />, title: t('serverCosts'), description: t('serverCostsDesc') },
    {
      icon: <Globe className="w-4 h-4 text-primary" />,
      title: t('domain'),
      description: t.rich('domainDesc', {mono: (chunks) => <span className="font-mono">{chunks}</span>}),
    },
  ];

  return (
    <div className="min-h-screen py-12 px-3">
      <div className="container mx-auto max-w-10xl space-y-12">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('subtitle')}</p>
          </div>
          <Button asChild className="rounded-full gap-2 shrink-0">
            <a href="https://ko-fi.com/interstella0" target="_blank" rel="noopener noreferrer">
              <Heart className="w-4 h-4" />
              {t('donateKofi')}
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
          </Button>
        </div>

        <Suspense fallback={<DonorsBoardLoading />}>
          <DonorsBoard
            topPromise={getTopSupporters()}
            recentPromise={getRecentSupporters(10)}
            specialThanksPromise={getSpecialThanks()}
            locale={locale}
          />
        </Suspense>

        <section className="rounded-2xl border border-border/50 bg-muted/20 p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {perks.map(({ icon, title, description }) => (
            <div key={title} className="space-y-1.5">
              <div className="flex items-center gap-2">
                {icon}
                <h3 className="font-semibold text-sm">{title}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
