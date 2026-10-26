'use client'
import {useTranslations} from 'next-intl';
import { useState, use } from 'react';
import { Globe, Radar } from 'lucide-react';
import { getFlagUrl, fetchServerUrl } from "utils/generalUtils.ts";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import Link from "next/link";
import Image from "next/image";
import {CountryStatistic} from "types/players.ts";
import { Button } from "components/ui/button";
import { Skeleton, SkeletonText } from "components/ui/skeleton";
import {useVaryWidth} from "lib/hooks/useVaryWidth";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {useResource} from "lib/hooks/useResource";
import {withErrorCatch} from "components/common/withErrorCatch";
import {IconCard} from "./IconCard";

const COUNTRIES_PER_PAGE = 10;
const TITLE_CLASS = "text-lg max-sm:text-sm font-semibold";

function CountriesSkeleton() {
    const varyWidth = useVaryWidth();
    return (
        <div className="p-2 space-y-2">
            {Array.from({ length: 10 }, (_, index) => (
                <div key={index} className="py-2">
                    <div className="flex items-center w-full justify-between">
                        <div className="flex items-center gap-2">
                            <Skeleton className="w-6 h-4" />
                            <div>
                                <SkeletonText className="h-4" style={varyWidth(index, 5, 5)} />
                            </div>
                        </div>
                        <div className="font-semibold">
                            <SkeletonText className="h-4 w-10" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function PlayerByCountriesDisplay({ initialDataPromise }: { initialDataPromise: Promise<{ countries: CountryStatistic[] }> }) {
    const t = useTranslations('players.byCountries');
    const initialData = use(initialDataPromise);
    const [page, setPage] = useState<number>(0);
    const { server } = useServerData()
    const serverId = server.id
    const { data, loading, error } = useResource<CountryStatistic[]>(
        () => fetchServerUrl(serverId, '/players/countries').then(data => data.countries || []),
        [serverId], { initial: initialData?.countries || [], keepData: true, errorLog: 'Error fetching countries:' });
    const countries = data ?? [];
    const totalPages = Math.ceil(countries.length / COUNTRIES_PER_PAGE);

    return (
        <IconCard
            icon={Globe}
            title={t('title')}
            titleClassName={TITLE_CLASS}
            action={
                <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                >
                    <Link href={`/servers/${server.gotoLink}/radar`} className="flex items-center gap-2">
                        <Radar className="w-4 h-4" />
                        <span className="max-sm:hidden">{t('viewRadar')}</span>
                    </Link>
                </Button>
            }
        >
            {loading ? (
                <CountriesSkeleton />
            ) : error?.message ? (
                <div className="p-4 text-center">
                    <p className="text-destructive">{t('loadError', {error: error.message})}</p>
                </div>
            ) : (
                <>
                    <div className="p-2 space-y-2">
                        {countries.slice(page * COUNTRIES_PER_PAGE, (page + 1) * COUNTRIES_PER_PAGE).map((country) => (
                            <div key={country.code} className="py-2">
                                <div className="flex items-center w-full justify-between">
                                    <div className="flex items-center gap-2">
                                        <Image
                                            src={getFlagUrl(country.code)}
                                            alt={country.name || 'Country Flag'}
                                            width={24}
                                            height={16}
                                        />
                                        <span>{country.name}</span>
                                    </div>
                                    <span className="text-primary font-semibold">
                                        {country.count}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {totalPages > 1 && (
                        <div className="flex justify-center pt-4">
                            <PaginationPage totalPages={totalPages} page={page} setPage={setPage} />
                        </div>
                    )}
                </>
            )}
        </IconCard>
    );
}

export function PlayerByCountriesLoading() {
    const t = useTranslations('players.byCountries');
    return (
        <IconCard
            icon={Globe}
            title={t('title')}
            titleClassName={TITLE_CLASS}
            action={
                <Button disabled variant="outline" size="sm" className="border-primary text-primary">
                    <Radar className="w-4 h-4" />
                    <span className="max-sm:hidden">{t('viewRadar')}</span>
                </Button>
            }
        >
            <CountriesSkeleton/>
            <div className="flex justify-center pt-4">
                <Skeleton className="h-9 w-64"/>
            </div>
        </IconCard>
    );
}

export default withErrorCatch(PlayerByCountriesDisplay, () => "Countries couldn't be loaded.")
