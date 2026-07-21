import { Metadata } from 'next';
import { formatTitle} from 'utils/generalUtils';
import { auth } from 'auth';
import MapGuidesList from 'components/maps/guides/MapGuidesList';
import {GuideContextProvider} from "../../../../lib/GuideContextProvider.tsx";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ map_name: string }>
}): Promise<Metadata> {
    const { map_name } = await params;
    const t = await getTranslations('metadata');

    return {
        title: formatTitle(t('guidesTitle', {map: map_name})),
        description: t('guidesDescription', {map: map_name}),
        alternates: {
            canonical: `/maps/${map_name}/guides`
        }
    };
}

export default async function GuidesPage({ params }: {
    params: Promise<{ map_name: string }>
}) {
    const { map_name } = await params;
    const session = await auth();
    const detail = { mapName: map_name }
    const t = await getTranslations('guides.pages');

    return (
        <GuideContextProvider value={detail}>
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
