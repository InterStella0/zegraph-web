import * as React from "react";
import {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import Footer from "components/ui/Footer";
import getServerUser from "../getServerUser";
import GlobalPlayerList from "components/players/GlobalPlayerList";
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
            <div className="container max-w-screen-xl mx-auto px-1 sm:px-4">
                <div className="flex flex-col gap-4 sm:gap-6">
                    <section>
                        <GlobalPlayerList />
                    </section>
                </div>
            </div>
        </div>
        <Footer />
    </>
}
