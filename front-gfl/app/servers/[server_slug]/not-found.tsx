import {getTranslations} from "next-intl/server";

export default async function NotFound() {
    const t = await getTranslations('servers.notFound');
    return (
        <div className="text-center mt-12">
            <h1 className="text-8xl font-black text-secondary">
                404
            </h1>
            <h4 className="text-4xl mt-2">
                {t('title')}
            </h4>
            <div className="my-8 mx-auto max-w-[500px] mt-6">
                <p className="text-primary">
                    {t('description')}
                </p>
            </div>
        </div>
    );
}