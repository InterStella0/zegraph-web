import { Metadata } from 'next';
import { Suspense } from 'react';
import { Heart, Server, Globe, ExternalLink } from 'lucide-react';
import { Button } from 'components/ui/button';
import ResponsiveAppBar from 'components/ui/ResponsiveAppBar';
import Footer from 'components/ui/Footer';
import getServerUser from '../getServerUser';
import { URI } from 'utils/generalUtils';
import { getTranslations, getLocale } from 'next-intl/server';
import DonorsBoard, { DonorsBoardLoading, Donor, SpecialThanks } from './DonorsBoard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('donorsTitle'),
    description: t('donorsDescription'),
    alternates: {
      canonical: '/donors'
    },
  };
}

async function getDonors(): Promise<Donor[]> {
  try {
    const res = await fetch(URI('/donations'), { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data ?? [];
  } catch {
    return [];
  }
}

async function getSpecialThanks(): Promise<SpecialThanks[]> {
  try {
    const res = await fetch(URI('/special-thanks'), { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data ?? [];
  } catch {
    return [];
  }
}

export default async function DonatePage() {
  const t = await getTranslations('donors');
  const locale = await getLocale();
  const user = getServerUser();
  const donorsPromise = getDonors();
  const specialThanksPromise = getSpecialThanks();

  return (
    <>
      <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />

      <div className="min-h-screen py-12 px-3">
        <div className="container mx-auto max-w-10xl space-y-12">

          {/* Page header */}
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

          {/* Top + Recent + Special Thanks */}
          <Suspense fallback={<DonorsBoardLoading />}>
            <DonorsBoard
              donorsPromise={donorsPromise}
              specialThanksPromise={specialThanksPromise}
              locale={locale}
            />
          </Suspense>

          {/* Why section */}
          <section className="rounded-2xl border border-border/50 bg-muted/20 p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🚫</span>
                <h3 className="font-semibold text-sm">{t('noAds')}</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('noAdsDesc')}
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">{t('serverCosts')}</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('serverCostsDesc')}
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">{t('domain')}</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.rich('domainDesc', {mono: (chunks) => <span className="font-mono">{chunks}</span>})}
              </p>
            </div>
          </section>

        </div>
      </div>

      <Footer />
    </>
  );
}
