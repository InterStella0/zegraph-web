import {Metadata} from "next";
import {Suspense} from "react";
import {getTranslations} from "next-intl/server";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import Footer from "components/ui/Footer";
import getServerUser from "../getServerUser";
import GlobalPlayerList, {GlobalPlayerListLoading} from "components/players/GlobalPlayerList";
import GlobalPlayersOnline, {GlobalPlayersOnlineLoading} from "components/players/GlobalPlayersOnline";
import {fetchApiUrl, fetchUrl, socialMeta} from "utils/generalUtils.ts";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('metadata');
    const title = t('globalPlayersTitle');
    const description = t('globalPlayersDescription');
    return {
        title,
        description,
        alternates: {
            canonical: '/players'
        },
        ...socialMeta({title, description, url: '/players'}),
    }
}

export default async function Page() {
    const user = getServerUser();
    const globalPlayersPromise = fetchUrl('/communities/all/players', {params: {page: 0}});
    const globalOnlinePromise = fetchApiUrl('/communities/all/players/playing');

    return <>
        <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />
        <div className="min-h-screen py-2 sm:py-4">
            <div className="container max-w-screen-2xl mx-auto px-1 sm:px-2 lg:px-4">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem] gap-4 sm:gap-6 items-start">
                    <section className="min-w-0">
                        <Suspense fallback={<GlobalPlayerListLoading/>}>
                            <GlobalPlayerList initialDataPromise={globalPlayersPromise} />
                        </Suspense>
                    </section>
                    <aside className="min-w-0 lg:sticky lg:top-4">
                        <Suspense fallback={<GlobalPlayersOnlineLoading/>}>
                            <GlobalPlayersOnline initialDataPromise={globalOnlinePromise} />
                        </Suspense>
                    </aside>
                </div>
            </div>
        </div>
        <Footer />
    </>
}
