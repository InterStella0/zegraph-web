import * as React from "react";
import {Metadata} from "next";
import {ThemeProvider} from "components/providers/theme-provider";
import {CommunityServerProvider} from "components/ui/ServerProvider";
import {getCommunity} from "./getCommunity";
import './globals.css'
import {DOMAIN} from "utils/generalUtils.ts";
import {Toaster} from "components/ui/sonner";
import {SakuraBackground} from "components/backgrounds/SakuraBackground";
import {inter} from './fonts';
import {PostHogProvider} from "./providers.tsx";
import {AnnouncementsContainer} from "components/announcements/AnnouncementsContainer";
import {NotificationBannerLoader} from "components/notifications/NotificationBannerLoader";
import {DonorBanner} from "components/ui/DonorBanner";
import getServerUser from "./getServerUser";
import NextTopLoader from "nextjs-toploader";
import {NextIntlClientProvider} from "next-intl";
import {getLocale, getTranslations} from "next-intl/server";
import {DayjsLocaleProvider} from "components/providers/DayjsLocaleProvider";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('metadata');
    const description = t('rootDescription');
    return {
        title: 'ZE Graph',
        description,
        metadataBase: new URL(DOMAIN),
        applicationName: 'ZE Graph',
        category: 'Games',
        creator: 'InterStella0',
        publisher: 'ZE Graph',
        authors: [{name: 'InterStella0'}],
        keywords: [
            'zombie escape',
            'ze',
            'cs2 zombie escape',
            'cs2ze',
            'cs zombie escape',
            'counter-strike zombie escape',
            'counter-strike zombie escape graph',
            'csgo zombie escape',
            'css zombie escape',
            'zombie escape servers',
            'zombie escape communities',
            'zombie escape stats',
            'zombie escape analytics',
            'ze graph',
            'zombie escape graph',
            'cs zombie escape graph',
        ],
        openGraph: {
            type: 'website',
            siteName: 'ZE Graph',
            title: 'ZE Graph',
            description,
            url: '/',
            locale: 'en_US',
        },
        twitter: {
            card: 'summary_large_image',
            title: 'ZE Graph',
            description,
            creator: '@queeniemella',
        },
    }
}


export default async function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const communities = getCommunity();
    const user = getServerUser();
    const locale = await getLocale();
    // AdSpot renders an <amp-ad> element, which needs the AMP runtime. Only pull in that
    // third-party script when AdSpot will actually render one.
    const adsEnabled = process.env.NEXT_PUBLIC_AD_SHOW?.toUpperCase() !== "FALSE"
        && !!process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID
        && !!process.env.NEXT_PUBLIC_ADSENSE_AD_SLOT;
    return (
        <html lang={locale} className={inter.variable} suppressHydrationWarning>
            <head>
                <link rel="icon" href="/favicon.ico" sizes="any" />
                <meta name="theme-color" content="#f48fb1" />
                {adsEnabled && (
                    <script async custom-element="amp-ad" src="https://cdn.ampproject.org/v0/amp-ad-0.1.js"></script>
                )}
            </head>
            <body>
                <NextIntlClientProvider>
                <DayjsLocaleProvider>
                <NextTopLoader color="#f48fb1" showSpinner={false} />
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <SakuraBackground />
                    <CommunityServerProvider promiseCommunities={communities}>
                        <PostHogProvider>
                            <div id="root">
                                <div className="body-before-footer">
                                    <AnnouncementsContainer />
                                    <DonorBanner />
                                    {children}
                                </div>
                            </div>
                            <NotificationBannerLoader userPromise={user} />
                            <Toaster />
                        </PostHogProvider>
                    </CommunityServerProvider>
                </ThemeProvider>
                </DayjsLocaleProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    )
}