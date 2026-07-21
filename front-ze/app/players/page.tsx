import {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import Footer from "components/ui/Footer";
import getServerUser from "../getServerUser";
import GlobalPlayerList from "components/players/GlobalPlayerList";
import GlobalPlayersOnline from "components/players/GlobalPlayersOnline";
import {socialMeta} from "utils/generalUtils.ts";

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

    return <>
        <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />
        <div className="min-h-screen py-2 sm:py-4">
            <div className="container max-w-screen-2xl mx-auto px-1 sm:px-2 lg:px-4">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem] gap-4 sm:gap-6 items-start">
                    <section className="min-w-0">
                        <GlobalPlayerList />
                    </section>
                    <aside className="min-w-0 lg:sticky lg:top-4">
                        <GlobalPlayersOnline />
                    </aside>
                </div>
            </div>
        </div>
        <Footer />
    </>
}
