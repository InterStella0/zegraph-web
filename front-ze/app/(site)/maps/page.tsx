import {Metadata} from "next";
import {Suspense} from "react";
import {getTranslations} from "next-intl/server";
import GlobalLiveMatch, {GlobalLiveMatchLoading} from "components/maps/global/GlobalLiveMatch";
import GlobalMapsIndex, {GlobalMapsIndexLoading} from "components/maps/global/GlobalMapsIndex";
import {GLOBAL_MAPS_DEFAULT_SORT} from "components/maps/global/constants";
import {AdSpot} from "components/ui/AdSpot";
import {fetchApiUrl, fetchUrl, socialMeta} from "utils/generalUtils.ts";
import getServerUser from "app/getServerUser.ts";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('metadata');
    const title = t('globalMapsTitle');
    const description = t('globalMapsDescription');
    return {
        title,
        description,
        alternates: {
            canonical: '/maps'
        },
        ...socialMeta({title, description, url: '/maps'}),
    }
}

export default async function Page() {
    const userPromise = getServerUser();
    const globalMapsPromise = userPromise.then(user =>
        (user ? fetchApiUrl : fetchUrl)('/maps', {params: {page: 0, sorted_by: GLOBAL_MAPS_DEFAULT_SORT}})
    );

    return (
        <div className="container max-w-screen-2xl mx-auto py-2 sm:py-4 px-1 sm:px-2 lg:px-4">
            <Suspense fallback={<GlobalLiveMatchLoading/>}>
                <GlobalLiveMatch userPromise={userPromise}/>
            </Suspense>
            <AdSpot className="my-4"/>
            <Suspense fallback={<GlobalMapsIndexLoading/>}>
                <GlobalMapsIndex initialDataPromise={globalMapsPromise} userPromise={userPromise}/>
            </Suspense>
        </div>
    )
}
