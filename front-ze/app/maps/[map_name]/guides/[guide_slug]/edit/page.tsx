import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatTitle} from 'utils/generalUtils';
import { auth, SteamSession } from 'auth';
import GuideEditor from 'components/maps/guides/GuideEditor';
import { getGuideBySlug } from "../../util";
import {GuideContextProvider} from "../../../../../../lib/GuideContextProvider.tsx";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ map_name: string; guide_slug: string }>
}): Promise<Metadata> {
    const t = await getTranslations('metadata');
    try {
        const {  map_name, guide_slug } = await params;

        const guide = await getGuideBySlug(map_name, guide_slug);

        if (!guide) {
            return { title: formatTitle(t('editGuideTitle')), robots: { index: false, follow: false } };
        }

        return {
            title: formatTitle(t('editGuideTitleNamed', {title: guide.title})),
            description: t('editGuideDescription', {map: map_name}),
            robots: { index: false, follow: false }
        };
    } catch (error) {
        return {
            title: formatTitle(t('editGuideTitle')),
            robots: { index: false, follow: false }
        };
    }
}

export default async function EditGuidePage({ params }: {
    params: Promise<{ server_slug: string; map_name: string; guide_slug: string }>
}) {
    const { map_name, guide_slug } = await params;
    const session = await auth() as SteamSession | null;

    if (!session?.user) {
        redirect(`/maps/${map_name}/guides`);
    }

    const guide = await getGuideBySlug(map_name, guide_slug);

    if (!guide){
        redirect(`/maps/${map_name}/guides`);
    }

    if (guide.author.id !== session.user.steam.steamid) {
        redirect(`/maps/${map_name}/guides/${guide.slug}`);
    }
    const mapDetail = { mapName: map_name, guide }
    const t = await getTranslations('guides.pages');

    return (
        <GuideContextProvider value={mapDetail}>
            <div className="container max-w-4xl mx-auto px-4 py-6">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">{t('editGuide')}</h1>
                    <p className="text-muted-foreground">
                        {t('updateYourGuide', {mapName: map_name})}
                    </p>
                </div>
                <GuideEditor mode="edit" session={session} />
            </div>
        </GuideContextProvider>
    );
}
