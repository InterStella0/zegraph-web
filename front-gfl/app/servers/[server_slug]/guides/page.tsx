import { Metadata } from 'next';
import { formatTitle } from 'utils/generalUtils';
import { getServerSlug, getServerSlugOrNotFound } from '../util';
import { auth } from '../../../../auth';
import ServerGuidesList from 'components/guides/ServerGuidesList';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string }>
}): Promise<Metadata> {
    const { server_slug } = await params;
    const t = await getTranslations('metadata');
    const server = await getServerSlugOrNotFound(server_slug);

    return {
        title: formatTitle(t('guidesHubTitle', {name: server.community_name})),
        description: t('guidesHubDescription', {name: server.community_name}),
        alternates: {
            canonical: `/servers/${server.gotoLink}/guides`
        }
    };
}

export default async function GuidesPage({ params }: {
    params: Promise<{ server_slug: string }>
}) {
    const { server_slug } = await params;
    const serverPromise = getServerSlug(server_slug);
    const sessionPromise = auth();
    const t = await getTranslations('guides.pages');

    return (
        <div className="p-6">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold mb-2">
                    {t('communityGuides')}
                </h1>
                <p className="text-lg text-muted-foreground">
                    {t('topRated')}
                </p>
            </div>
            <ServerGuidesList serverPromise={serverPromise} sessionPromise={sessionPromise} />
        </div>
    );
}
