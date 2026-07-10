import CommunityList, {CommunityListLoading} from "./CommunityList";
import {getCommunity} from "./getCommunity";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import * as React from "react";
import getServerUser from "./getServerUser";
import Footer from "components/ui/Footer";
import {Suspense} from "react";
import {AdSpot} from "components/ui/AdSpot";
import HomePopulationRadar from "components/home/HomePopulationRadar";
import HomeFaq from "components/home/HomeFaq";
import {getTranslations} from "next-intl/server";
import {Metadata} from "next";
import {DOMAIN, socialMeta} from "utils/generalUtils.ts";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('metadata');
    const title = t('homeTitle');
    const description = t('homeDescription');
    return {
        title,
        description,
        alternates: {
            canonical: '/'
        },
        ...socialMeta({title, description, url: '/'}),
    }
}

export default async function Page() {
    const communitiesDataPromise = getCommunity();
    const user = getServerUser();
    const t = await getTranslations('home');

    const jsonLd = [
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "ZE Graph",
            "url": DOMAIN,
            "logo": `${DOMAIN}/icon-512x512.png`,
            "description": t('tagline'),
            "sameAs": [
                "https://goes.queeniemella.cc/s/discord-zegraph",
                "https://github.com/InterStella0/zegraph-web",
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "ZE Graph",
            "url": DOMAIN,
            "description": t('tagline'),
            "inLanguage": "en",
        },
    ];

    return <>
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
        />
        <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />
        <div className="min-h-screen py-2 sm:py-4">
            <div className="container max-w-screen-xl mx-auto px-1 sm:px-4">
                <div className="flex flex-col gap-4 sm:gap-6">
                    <div className="text-center px-1 sm:px-0">
                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-primary mb-2 break-words">
                            {t('heading')}
                        </h1>
                        <p className="text-base sm:text-lg md:text-xl break-words">
                            {t('tagline')}
                        </p>
                        <p className="text-base sm:text-sm md:text-md break-words">
                            {t('tracking')}
                        </p>
                    </div>
                    <AdSpot className="w-full" />
                    <HomePopulationRadar />
                    <section>
                        <Suspense fallback={<CommunityListLoading />}>
                            <CommunityList communitiesDataPromise={communitiesDataPromise} />
                        </Suspense>
                    </section>
                    <Suspense fallback={null}>
                        <HomeFaq communitiesDataPromise={communitiesDataPromise} />
                    </Suspense>
                </div>
            </div>
        </div>
        <Footer />
    </>
}
