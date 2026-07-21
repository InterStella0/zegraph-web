import { Metadata } from 'next';
import { formatTitle} from 'utils/generalUtils';
import { getServerSlugOrNotFound } from '../../../../util';
import { auth } from 'auth';
import GuideDetail from 'components/maps/guides/GuideDetail';
import GuideComments from 'components/maps/guides/GuideComments';
import {getGuideBySlug, resolveGuideLink} from "../../../../../../maps/[map_name]/guides/util.ts";
import {GuideContextProvider} from "lib/GuideContextProvider.tsx";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string; map_name: string; guide_slug: string }>
}): Promise<Metadata> {
    const t = await getTranslations('metadata');
    const { server_slug, map_name, guide_slug } = await params;
    const server = await getServerSlugOrNotFound(server_slug);
    try {
        const guide = await getGuideBySlug(map_name, guide_slug, server.id);

        if (!guide) {
            return { title: formatTitle(t('guideNotFound')) };
        }

        // Create excerpt for description
        const excerpt = guide.content
            .replace(/[#*`\[\]()]/g, '')
            .replace(/\n+/g, ' ')
            .trim()
            .slice(0, 160);

        const canonical = resolveGuideLink(!guide.server_id? null: server.gotoLink, `/${map_name}/guides/${guide.slug}`)
        return {
            title: formatTitle(`${guide.title} - ${map_name}`),
            description: excerpt,
            alternates: {
                canonical: canonical
            }
        };
    } catch (error) {
        return {
            title: formatTitle(t('guideNotFound'))
        };
    }
}

export default async function GuidePage({ params }: {
    params: Promise<{ server_slug: string; map_name: string; guide_slug: string }>
}) {
    const { map_name, server_slug, guide_slug } = await params;
    const session = await auth()
    const guideData = {
        guidePromise: getServerSlugOrNotFound(server_slug).then(s => getGuideBySlug(map_name, guide_slug, s.id)),
        serverSlug: server_slug,
        mapName: map_name,
        insideServer: true
    }

    return (
        <GuideContextProvider value={guideData}>
            <div className="container max-w-4xl mx-auto px-4 py-6 ">
                <GuideDetail session={session} />
                <div className="mt-8">
                    <GuideComments session={session} />
                </div>
            </div>
        </GuideContextProvider>
    );
}
