import CommunityList, {CommunityListLoading} from "./CommunityList";
import {getCommunity} from "./getCommunity";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import * as React from "react";
import getServerUser from "./getServerUser";
import Footer from "components/ui/Footer";
import {Suspense} from "react";
import {AdSpot} from "components/ui/AdSpot";
import HomePopulationRadar from "components/home/HomePopulationRadar";

export default async function Page() {
    const communitiesDataPromise = getCommunity();
    const user = getServerUser();

    return <>
        <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />
        <div className="min-h-screen py-2 sm:py-4">
            <div className="container max-w-screen-xl mx-auto px-1 sm:px-4">
                <div className="flex flex-col gap-4 sm:gap-6">
                    <div className="text-center px-1 sm:px-0">
                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-primary mb-2 break-words">
                            Communities
                        </h1>
                        <p className="text-base sm:text-lg md:text-xl break-words">
                            Zombie Escape communities that I track &gt;:3
                        </p>
                    </div>
                    <HomePopulationRadar />
                    <AdSpot className="w-full" />
                    <Suspense fallback={<CommunityListLoading />}>
                        <CommunityList communitiesDataPromise={communitiesDataPromise} />
                    </Suspense>
                </div>
            </div>
        </div>
        <Footer />
    </>
}
