import { Metadata } from 'next';
import { formatTitle } from 'utils/generalUtils';
import { getServerSlug } from '../../../../util';
import GuideEditor from 'components/maps/guides/GuideEditor';
import {GuideContextDataInsert, GuideContextProvider} from "lib/GuideContextProvider.tsx";
import {auth, SteamSession} from "auth";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string; map_name: string }>
}): Promise<Metadata> {
    const { server_slug, map_name } = await params;
    const t = await getTranslations('metadata');
    const server = await getServerSlug(server_slug);

    if (!server) {
        return {};
    }

    return {
        title: formatTitle(t('createGuideTitle', {map: map_name})),
        description: t('createGuideDescription', {map: map_name}),
        alternates: {
            canonical: `/servers/${server.gotoLink}/maps/${map_name}/guides/new`
        }
    };
}

export default async function NewGuidePage({ params }: {
    params: Promise<{ server_slug: string; map_name: string }>
}) {
    const { map_name, server_slug } = await params;
    const mapDetail = { serverSlug: server_slug, mapName: map_name, insideServer: true } as GuideContextDataInsert
    const session = await auth() as SteamSession | null;
    const t = await getTranslations('guides.pages');

    return (
        <GuideContextProvider value={mapDetail}>
            <div className="container max-w-4xl mx-auto px-4 py-6">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">{t('createNewFor', {mapName: map_name})}</h1>
                    <p className="text-muted-foreground">
                        {t('shareKnowledge')}
                    </p>
                </div>
                <GuideEditor mode="create" session={session} defaultScope="server" />
            </div>
        </GuideContextProvider>
    );
}
