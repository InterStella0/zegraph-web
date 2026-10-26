import LiveServerTrackerPage from "./TrackerPage";
import {Metadata} from "next";
import {formatTitle} from "utils/generalUtils.ts";
import {getTranslations} from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('metadata');
    return {
        title: formatTitle(t('liveTitle')),
        description: t('liveDescription'),
        alternates: {canonical: '/live'},
    }
}

export default function Page(){
    return <LiveServerTrackerPage />
}
