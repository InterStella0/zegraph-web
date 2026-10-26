import CommunityList, {CommunityListLoading} from "./CommunityList";
import {getCommunity} from "app/getCommunity";
import {Suspense} from "react";
import {AdSpot} from "components/ui/AdSpot";
import HomePopulationRadar from "components/home/HomePopulationRadar";
import HomeFaq from "components/home/HomeFaq";
import {fetchGlobalContinents, fetchPopulationSeed} from "components/home/homeData";
import {getTranslations} from "next-intl/server";
import {Metadata} from "next";
import {DOMAIN, socialMeta} from "utils/generalUtils.ts";
import {JsonLd} from "components/common/JsonLd";
import {DISCORD_URL, REPO_URL} from "components/ui/siteLinks";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('metadata');
    const title = t('homeTitle');
    const description = t('homeDescription');
    return {
        title,
        description,
        alternates: {canonical: '/'},
        ...socialMeta({title, description, url: '/'}),
    }
}

export default async function Page() {
    const communitiesDataPromise = getCommunity();
    const continentsPromise = fetchGlobalContinents();
    const populationPromise = communitiesDataPromise.then(fetchPopulationSeed).catch(() => null);
    const t = await getTranslations('home');

    const entity = (type: string, fields: object) => ({
        "@context": "https://schema.org",
        "@type": type,
        "name": "ZE Graph",
        "url": DOMAIN,
        ...fields,
    });
    const jsonLd = [
        entity("Organization", {
            "logo": `${DOMAIN}/icon-512x512.png`,
            "description": t('tagline'),
            "sameAs": [DISCORD_URL, REPO_URL],
        }),
        entity("WebSite", {"description": t('tagline'), "inLanguage": "en"}),
    ];

    return <>
        <JsonLd data={jsonLd} />
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
                    <HomePopulationRadar continentsPromise={continentsPromise} populationPromise={populationPromise} />
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
    </>
}
