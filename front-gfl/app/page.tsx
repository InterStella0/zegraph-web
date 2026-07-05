import CommunityList, {CommunityListLoading} from "./CommunityList";
import {getCommunity} from "./getCommunity";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import * as React from "react";
import getServerUser from "./getServerUser";
import Footer from "components/ui/Footer";
import {Suspense} from "react";
import {AdSpot} from "components/ui/AdSpot";
import HomePopulationRadar from "components/home/HomePopulationRadar";
import {getTranslations} from "next-intl/server";

export default async function Page() {
    const communitiesDataPromise = getCommunity();
    const user = getServerUser();
    const t = await getTranslations('home');

    return <>
        <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />
        <div className="min-h-screen py-2 sm:py-4">
            <div className="container max-w-screen-xl mx-auto px-1 sm:px-4">
                <div className="flex flex-col gap-4 sm:gap-6">
                    <div className="text-center px-1 sm:px-0">
                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-primary mb-2 break-words">
                            {t('title')}
                        </h1>
                        <p className="text-base sm:text-lg md:text-xl break-words">
                            {t('subtitle')}
                        </p>
                        <p className="text-base sm:text-sm md:text-md break-words">
                            {t('description')}
                        </p>
                    </div>
                    <AdSpot className="w-full" />
                    <HomePopulationRadar />
                    <Suspense fallback={<CommunityListLoading />}>
                        <CommunityList communitiesDataPromise={communitiesDataPromise} />
                    </Suspense>
                </div>
            </div>
        </div>
        <Footer />
    </>
}
