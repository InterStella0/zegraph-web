import { Metadata } from 'next';
import { formatTitle} from 'utils/generalUtils';
import { auth } from 'auth';
import GuideDetail from 'components/maps/guides/GuideDetail';
import GuideComments from 'components/maps/guides/GuideComments';
import { getGuideBySlug } from "../util";
import {GuideContextProvider} from "../../../../../lib/GuideContextProvider.tsx";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ map_name: string; guide_slug: string }>
}): Promise<Metadata> {
    const t = await getTranslations('metadata');
    try {
        const {  map_name, guide_slug } = await params;

        const guide = await getGuideBySlug(map_name, guide_slug);

        if (!guide) {
            return { title: formatTitle(t('guideNotFound')) };
        }

        // Create excerpt for description
        const excerpt = guide.content
            .replace(/[#*`\[\]()]/g, '')
            .replace(/\n+/g, ' ')
            .trim()
            .slice(0, 160);

        return {
            title: formatTitle(`${guide.title} - ${map_name}`),
            description: excerpt,
            alternates: {
                canonical: `/maps/${map_name}/guides/${guide.slug}`
            }
        };
    } catch (error) {
        return {
            title: formatTitle(t('guideNotFound'))
        };
    }
}

export default async function GuidePage({ params }: {
    params: Promise<{ map_name: string; guide_slug: string }>
}) {
    const { map_name, guide_slug } = await params;
    const session = await auth()
    const guideData = {
        mapName: map_name,
        guidePromise: getGuideBySlug(map_name, guide_slug)
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
