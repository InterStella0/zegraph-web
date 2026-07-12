import { Metadata } from 'next';
import {fetchServerUrl, formatTitle, StillCalculate} from 'utils/generalUtils';
import { getServerSlugOrNotFound } from '../../../util';
import { auth } from '../../../../../../auth';
import MapGuidesList from 'components/maps/guides/MapGuidesList';
import {MapContextProvider} from "../MapContext.tsx";
import {ServerMapDetail} from "types/maps.ts";
import {GuideContextDataInsert, GuideContextProvider} from "../../../../../../lib/GuideContextProvider.tsx";
import { getTranslations } from 'next-intl/server';


export async function getBasicMapInfoDetails(serverId: string, mapName: string){
    const toReturn = { info: null, analyze: null, notReady: false, name: mapName, serverId }
    return toReturn as ServerMapDetail
}

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string; map_name: string }>
}): Promise<Metadata> {
    const { server_slug, map_name } = await params;
    const t = await getTranslations('metadata');
    const server = await getServerSlugOrNotFound(server_slug);

    return {
        title: formatTitle(t('guidesTitle', {map: map_name})),
        description: t('guidesServerDescription', {map: map_name, name: server.community_name}),
        alternates: {
            canonical: `/servers/${server.gotoLink}/maps/${map_name}/guides`
        }
    };
}

export default async function GuidesPage({ params }: {
    params: Promise<{ server_slug: string; map_name: string }>
}) {
    const { map_name, server_slug } = await params;
    const session = await auth();
    const mapDetail = {
        serverSlug: server_slug, mapName: map_name,
        serverIdPromise: getServerSlugOrNotFound(server_slug).then(s => s.id),
        insideServer: true
    } as GuideContextDataInsert
    const t = await getTranslations('guides.pages');

    return (
        <GuideContextProvider value={mapDetail}>
            <div className="container max-w-screen-xl mx-auto px-4 py-6">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">{t('communityGuidesFor', {mapName: map_name})}</h1>
                    <p className="text-muted-foreground">
                        {t('browseShare')}
                    </p>
                </div>
                <MapGuidesList session={session} />
            </div>
        </GuideContextProvider>
    );
}
