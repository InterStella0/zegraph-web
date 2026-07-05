import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {formatTitle} from 'utils/generalUtils';
import { getServerSlug } from '../../../../../util';
import { auth, SteamSession } from 'auth';
import GuideEditor from 'components/maps/guides/GuideEditor';
import {GuideContextProvider} from "lib/GuideContextProvider.tsx";
import {getGuideBySlug} from "../../../../../../../maps/[map_name]/guides/util.ts";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string; map_name: string; guide_slug: string }>
}): Promise<Metadata> {
    const t = await getTranslations('metadata');
    try {
        const { server_slug, map_name, guide_slug } = await params;
        const server = await getServerSlug(server_slug);

        if (!server) {
            return {};
        }

        const guide = await getGuideBySlug(map_name, guide_slug, server.id);

        if (!guide) {
            return { title: formatTitle(t('editGuideTitle')) };
        }

        return {
            title: formatTitle(t('editGuideTitleNamed', {title: guide.title})),
            description: t('editGuideDescription', {map: map_name}),
            alternates: {
                canonical: `/servers/${server.gotoLink}/maps/${map_name}/guides/${guide.slug}/edit`
            }
        };
    } catch (error) {
        return {
            title: formatTitle(t('editGuideTitle'))
        };
    }
}

export default async function EditGuidePage({ params }: {
    params: Promise<{ server_slug: string; map_name: string; guide_slug: string }>
}) {
    const { server_slug, map_name, guide_slug } = await params;
    const session = await auth() as SteamSession | null;

    if (!session?.user) {
        redirect(`/servers/${server_slug}/maps/${map_name}/guides`);
    }
    const server = getServerSlug(server_slug)
    const guide = await server.then(s => getGuideBySlug(map_name, guide_slug, s.id))

    if (!guide){
        redirect(`/servers/${server_slug}/maps/${map_name}/guides`);
    }

    if (guide.author.id !== session.user.steam.steamid) {
        redirect(`/servers/${server_slug}/maps/${map_name}/guides/${guide.slug}`);
    }

    const data = { mapName: map_name, guide, serverSlug: server_slug, insideServer: true, serverIdPromise: server.then(s => s.id) }
    const t = await getTranslations('guides.pages');
    return (
        <GuideContextProvider value={data}>
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
