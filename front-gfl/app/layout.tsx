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

export const metadata: Metadata = {
    title: 'ZE Graph',
    description: 'Shows Zombie Escape (ZE) player activities on many western servers. ' +
        'Popular servers like GFL, Mapeadores, RSS, PSE, Net4All, Cola-Team and many more are tracked!',
    metadataBase: new URL(DOMAIN),
    alternates: {
        canonical: '/'
    }
}


export default async function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const communities = getCommunity();
    const user = getServerUser();
    return (
        <html lang="en" className={inter.variable} suppressHydrationWarning>
            <head>
                <link rel="icon" href="/favicon.ico" sizes="any" />
                <meta name="theme-color" content="#f48fb1" />
                <meta name="twitter:creator" content="@queeniemella" />
                <script async custom-element="amp-ad" src="https://cdn.ampproject.org/v0/amp-ad-0.1.js"></script>
            </head>
            <body>
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
            </body>
        </html>
    )
}