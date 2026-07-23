'use client'
import {useTranslations} from 'next-intl';
import { useState, useEffect, useRef, use } from 'react';
import { Globe, Radar } from 'lucide-react';
import { getFlagUrl, fetchServerUrl } from "utils/generalUtils.ts";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import Link from "next/link";
import Image from "next/image";
import {CountryStatistic} from "types/players.ts";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Skeleton } from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import ErrorCatch from "components/ui/ErrorMessage.tsx";

const CountriesSkeleton = () => (
    <div className="p-2 space-y-2">
        {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="py-2">
                <div className="flex items-center w-full justify-between">
                    <div className="flex items-center gap-2">
                        <Skeleton className="w-6 h-4" />
                        <Skeleton className="w-30 h-5" />
                    </div>
                    <Skeleton className="w-10 h-5" />
                </div>
            </div>
        ))}
    </div>
);

type PlayerByCountriesProps = { initialDataPromise: Promise<{ countries: CountryStatistic[] }> };

function PlayerByCountriesDisplay({ initialDataPromise }: PlayerByCountriesProps) {
    const t = useTranslations('players.byCountries');
    const initialData = use(initialDataPromise);
    const [countries, setCountries] = useState<CountryStatistic[]>(initialData?.countries || []);
    const [countriesLoading, setCountriesLoading] = useState<boolean>(false);
    const [countriesError, setCountriesError] = useState<string | null>(null);
    const [communityPage, setCommunityPage] = useState<number>(0);
    const { server } = useServerData()
    const serverId = server.id
    const isFirstRun = useRef(true);
    const COUNTRIES_PER_PAGE = 10;

    const fetchCountries = async () => {
        try {
            setCountriesLoading(true);
            setCountriesError(null);
            const data = await fetchServerUrl(serverId, '/players/countries');
            setCountries(data.countries || []);
        } catch (error) {
            console.error('Error fetching countries:', error);
            setCountriesError(error.message);
        } finally {
            setCountriesLoading(false);
        }
    };

    const getPaginatedCountries = () => {
        const startIndex = communityPage * COUNTRIES_PER_PAGE;
        const endIndex = startIndex + COUNTRIES_PER_PAGE;
        return countries.slice(startIndex, endIndex);
    };

    const totalCountryPages = Math.ceil(countries.length / COUNTRIES_PER_PAGE);

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        fetchCountries();
    }, [serverId]);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary"/>
                    <h2 className="text-lg max-sm:text-sm font-semibold">{t('title')}</h2>
                </div>
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
            </CardHeader>
            <CardContent className="pt-0">
                {countriesLoading ? (
                    <CountriesSkeleton />
                ) : countriesError ? (
                    <div className="p-4 text-center">
                        <p className="text-destructive">{t('loadError', {error: countriesError})}</p>
                    </div>
                ) : (
                    <>
                        <div className="p-2 space-y-2">
                            {getPaginatedCountries().map((country) => (
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
                        {totalCountryPages > 1 && (
                            <div className="flex justify-center pt-4">
                                <PaginationPage totalPages={totalCountryPages} page={communityPage} setPage={setCommunityPage} />
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export function PlayerByCountriesLoading() {
    const t = useTranslations('players.byCountries');
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary"/>
                    <h2 className="text-lg max-sm:text-sm font-semibold">{t('title')}</h2>
                </div>
                <Button
                    disabled
                    variant="outline"
                    size="sm"
                    className="border-primary text-primary"
                >
                    <Radar className="w-4 h-4" />
                    <span className="max-sm:hidden">{t('viewRadar')}</span>
                </Button>
            </CardHeader>
            <CardContent className="pt-0">
                <CountriesSkeleton/>
            </CardContent>
        </Card>
    );
}

export default function PlayerByCountries({ initialDataPromise }: PlayerByCountriesProps) {
    return (
        <ErrorCatch message="Countries couldn't be loaded.">
            <PlayerByCountriesDisplay initialDataPromise={initialDataPromise}/>
        </ErrorCatch>
    );
}
