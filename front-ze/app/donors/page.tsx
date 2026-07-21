import { Metadata } from 'next';
import { Heart, Server, Globe, ExternalLink, Clock, Trophy, Sparkles } from 'lucide-react';
import { Button } from 'components/ui/button';
import ResponsiveAppBar from 'components/ui/ResponsiveAppBar';
import Footer from 'components/ui/Footer';
import getServerUser from '../getServerUser';
import { URI } from 'utils/generalUtils';
import { getTranslations, getLocale } from 'next-intl/server';
import { ExpandableText } from './ExpandableText';

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

interface Donor {
  id: string;
  display_name: string;
  message: string | null;
  donated_at: string;
}

interface SpecialThanks {
  id: string;
  display_name: string;
  description: string;
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

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export default async function DonatePage() {
  const t = await getTranslations('donors');
  const locale = await getLocale();
  const user = getServerUser();
  const [donors, specialThanks] = await Promise.all([getDonors(), getSpecialThanks()]);

  const recent = [...donors]
    .sort((a, b) => new Date(b.donated_at).getTime() - new Date(a.donated_at).getTime())
    .slice(0, 10);

  // Server returns donors sorted by cumulative amount (admin-controlled)
  const top = donors.slice(0, 10);

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
          {donors.length > 0 || specialThanks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

              {/* Top donors */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">{t('topDonors')}</h2>
                </div>
                {top.length > 0 ? (
                <div className="space-y-2">
                  {top.map((donor, i) => (
                    <div
                      key={donor.id}
                      className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3"
                    >
                      <span className={`text-sm font-bold w-6 text-center shrink-0 ${
                        i === 0 ? 'text-yellow-500' :
                        i === 1 ? 'text-zinc-400' :
                        i === 2 ? 'text-amber-600' :
                        'text-muted-foreground'
                      }`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{donor.display_name}</p>
                        {donor.message && (
                          <ExpandableText
                            text={`“${donor.message}”`}
                            className="text-xs text-muted-foreground"
                            clampClassName="truncate"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('noDonors')}</p>
                )}
              </section>

              {/* Recent donations */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">{t('recentDonations')}</h2>
                </div>
                {recent.length > 0 ? (
                <div className="space-y-2">
                  {recent.map((donor) => (
                    <div
                      key={donor.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium truncate">{donor.display_name}</p>
                        {donor.message && (
                          <ExpandableText
                            text={`“${donor.message}”`}
                            className="text-xs text-muted-foreground"
                            clampClassName="line-clamp-1"
                          />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5 shrink-0">
                        {formatDate(donor.donated_at, locale)}
                      </span>
                    </div>
                  ))}
                </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('noDonors')}</p>
                )}
              </section>

              {/* Special thanks */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">{t('specialThanks')}</h2>
                </div>
                {specialThanks.length > 0 ? (
                <div className="space-y-2">
                  {specialThanks.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3"
                    >
                      <p className="font-medium truncate">{entry.display_name}</p>
                      <ExpandableText
                        text={entry.description}
                        className="text-xs text-muted-foreground"
                        clampClassName="line-clamp-2"
                      />
                    </div>
                  ))}
                </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('noSpecialThanks')}</p>
                )}
              </section>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground space-y-2">
              <p className="text-lg font-medium">{t('noDonors')}</p>
              <p className="text-sm">{t('yourName')}</p>
            </div>
          )}

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
