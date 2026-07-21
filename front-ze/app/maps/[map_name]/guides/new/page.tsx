import { Metadata } from 'next';
import { formatTitle } from 'utils/generalUtils';
import GuideEditor from 'components/maps/guides/GuideEditor';
import {GuideContextProvider} from "../../../../../lib/GuideContextProvider.tsx";
import {auth, SteamSession} from "../../../../../auth.ts";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ map_name: string }>
}): Promise<Metadata> {
    const { map_name } = await params;
    const t = await getTranslations('metadata');

    return {
        title: formatTitle(t('createGuideTitle', {map: map_name})),
        description: t('createGuideDescription', {map: map_name}),
        robots: { index: false, follow: false }
    };
}

export default async function NewGuidePage({ params }: {
    params: Promise<{ map_name: string }>
}) {
    const { map_name } = await params;
    const mapDetail = { mapName: map_name }
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
                <GuideEditor mode="create" session={session} defaultScope="global" />
            </div>
        </GuideContextProvider>
    );
}
