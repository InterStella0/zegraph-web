import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import Footer from "components/ui/Footer";
import * as React from "react";
import getServerUser from "app/getServerUser";
import FetchStatusTable from "components/status/FetchStatusTable";
import { Metadata } from "next";
import {formatTitle} from "utils/generalUtils.ts";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('metadata');
    return {
        title: formatTitle(t('statusTitle')),
        description: t('statusDescription'),
        alternates: {
            canonical: '/status'
        }
    }
}

export default async function StatusPage() {
    const t = await getTranslations('status');
    const user = getServerUser();

    return <>
        <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />
        <div className="min-h-screen py-2 sm:py-4">
            <div className="container max-w-screen-lg mx-auto px-1 sm:px-3">
                <div className="flex flex-col gap-4 sm:gap-6">
                    <div className="text-center px-1 sm:px-0">
                        <h1 className="text-4xl sm:text-5xl font-bold text-primary mb-2">
                            {t('title')}
                        </h1>
                        <p className="text-base sm:text-lg text-muted-foreground">
                            {t('subtitle')}
                        </p>
                    </div>
                    <FetchStatusTable />
                </div>
            </div>
        </div>
        <Footer />
    </>;
}
