'use client'
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Separator } from "components/ui/separator";
import { ChevronLeft, ChevronRight, MapPinOff, Loader2 } from "lucide-react";
import { PlayerAvatar } from "../players/PlayerAvatar.tsx";
import { getFlagUrl, secondsToHours } from "utils/generalUtils.ts";
import { useServerData } from "../../app/servers/[server_slug]/ServerDataProvider";
import Link from "next/link";
import { useTranslations, useLocale } from 'next-intl';
const PlayerPopupContent = ({
                                isLoading,
                                countryData,
                                currentPlayers,
                                totalPlayers,
                                page,
                                totalPages,
                                position,
                                error,
                                onPageChange
                            }) => {
    const t = useTranslations('radar.popup');
    // Handle error display
    if (error) {
        return (
            <Card className="border-0 shadow-none p-1 card-solid">
                <CardContent className="p-0">
                    <div className="flex flex-col items-center justify-center text-center py-2">
                        {error === "Unknown country selected" ? (
                            <>
                                <MapPinOff className="w-12 h-12 my-4" />
                                <p className="font-medium text-sm">
                                    {t('nothingFound')}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {t('coordinates')} {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
                                </p>
                            </>
                        ) : (
                            <>
                                <span className="text-3xl mb-2">⚠️</span>
                                <p className="font-medium text-sm">
                                    {t('error')}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {error}
                                </p>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-0 shadow-none p-1 card-solid">
            <CardContent className="p-0">
                {isLoading ? (
                    <LoadingState />
                ) : (
                    <>
                        <CountryHeader
                            countryData={countryData}
                            position={position}
                        />

                        <Separator className="my-1" />

                        <h3 className="text-xs font-semibold mb-1">
                            {t('players', {count: totalPlayers})}
                        </h3>

                        <PlayerList
                            players={currentPlayers}
                        />

                        <PaginationControls
                            page={page}
                            totalPages={totalPages}
                            onPageChange={onPageChange}
                        />
                    </>
                )}
            </CardContent>
        </Card>
    );
};

// Loading indicator component
const LoadingState = () => {
    const t = useTranslations('radar.popup');
    return (
    <div className="flex justify-center items-center p-2">
        <Loader2 className="w-5 h-5 animate-spin mx-2" />
        <p className="text-xs ml-1.5">
            {t('loadingPlayers')}
        </p>
    </div>
    );
};

// Country header with flag and info
const CountryHeader = ({ countryData, position }) => {
    const t = useTranslations('radar.popup');
    return (
    <div className="flex items-center mb-1">
        {countryData?.properties?.code && (
            <img
                src={getFlagUrl(countryData?.properties?.code)}
                alt={countryData?.properties?.name || 'Country Flag'}
                className="mr-4"
            />
        )}
        <div>
            <h2 className="text-sm font-bold text-primary leading-tight m-0">
                {countryData ? `${countryData.properties.name} (${countryData.properties.code})` : t('loading')}
            </h2>
            <p className="text-xs text-muted-foreground leading-tight">
                {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
            </p>
        </div>
    </div>
    );
};

// Player list component - now using PlayerAvatar and more compact
const PlayerList = ({ players }) => {
    const t = useTranslations('radar.popup');
    const locale = useLocale();
    const { server } = useServerData()
    return (
        <div className="max-h-[270px] overflow-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {players && players.length > 0 ? (
                <div className="space-y-px">
                    {players.map((player) => (
                        <div
                            key={player.id}
                            className="flex items-center py-1 px-1 min-h-[36px] border-b border-border last:border-0"
                        >
                            <div className="w-full flex items-center text-primary">
                                <PlayerAvatar
                                    uuid={player.id}
                                    name={player.name}
                                    width={24}
                                    height={24}
                                    className="mr-2 ml-4 shrink-0"
                                />
                                <div className="flex flex-col w-full overflow-hidden">
                                    <Link
                                        href={`/servers/${server.gotoLink}/players/${player.id}`}
                                        className="font-medium text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis hover:underline"
                                    >
                                        {player.name}
                                    </Link>
                                    <p className="text-xs text-muted-foreground leading-tight">
                                        {t('playerStats', {hours: secondsToHours(player.total_playtime, locale), sessions: player.session_count})}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-center p-2">
                    {t('noPlayers')}
                </p>
            )}
        </div>
    )
}

const PaginationControls = ({ page, totalPages, onPageChange }) => (
    <div className="pagination-controls flex justify-center items-center mt-1">
        <Button
            variant="ghost"
            size="icon-sm"
            disabled={page === 1}
            onClick={(e) => {
                e.stopPropagation();
                onPageChange(page - 1)
            }}
            className="p-1"
        >
            <ChevronLeft className="w-3.5 h-3.5" />
        </Button>

        <span className="text-xs mx-1">
            {page} / {totalPages || 1}
        </span>

        <Button
            variant="ghost"
            size="icon-sm"
            disabled={page === totalPages || totalPages === 0}
            onClick={(e) => {
                e.stopPropagation();
                onPageChange(page + 1)
            }}
            className="p-1"
        >
            <ChevronRight className="w-3.5 h-3.5" />
        </Button>
    </div>
);

export default PlayerPopupContent;