import {getTranslations} from "next-intl/server";
import {StatusPage} from "components/common/StatusPage";

export default async function NotFound() {
    const t = await getTranslations('servers.notFound');
    return <StatusPage code="404" title={t('title')}>{t('description')}</StatusPage>;
}
