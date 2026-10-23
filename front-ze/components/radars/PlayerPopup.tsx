import { ReactNode } from 'react';
import { Popup } from 'react-leaflet';
import type { LatLng } from 'leaflet';
import Link from "next/link";
import { useTranslations, useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight, MapPinOff, Loader2 } from "lucide-react";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Separator } from "components/ui/separator";
import { PlayerAvatar } from "components/players/PlayerAvatar.tsx";
import { PlayerName } from "components/players/PlayerName";
import { getFlagUrl, secondsToHours } from "utils/generalUtils.ts";
import { useServerData } from "../../app/servers/[server_slug]/ServerDataProvider";
import type { CountryFeature, CountryPlayer } from 'types/radars';
import './PlayerPopup.css';

export const UNKNOWN_COUNTRY = "Unknown country selected";
const PLAYERS_PER_PAGE = 10;

export type PlayerPopupState = {
    position: LatLng;
    isLoading: boolean;
    countryData: CountryFeature | null;
    playerData: CountryPlayer[];
    totalPlayers: number;
    page: number;
    error: string | null;
}

const formatPosition = (position: LatLng) => `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;

function PageButton({ onClick, disabled, children }: { onClick: () => void, disabled: boolean, children: ReactNode }) {
    return (
        <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className="p-1"
        >
            {children}
        </Button>
    );
}

function PlayerList({ players }: { players: CountryPlayer[] }) {
    const t = useTranslations('radar.popup');
    const locale = useLocale();
    const { server } = useServerData()
    if (!players?.length) return <p className="text-xs text-center p-2">{t('noPlayers')}</p>;

    return (
        <div className="space-y-px">
            {players.map((player) => (
                <div key={player.id} className="flex items-center py-1 px-1 min-h-[36px] border-b border-border last:border-0">
                    <div className="w-full flex items-center text-primary">
                        <PlayerAvatar uuid={player.id} name={player.name} width={24} height={24} className="mr-2 ml-4 shrink-0" />
                        <div className="flex flex-col w-full overflow-hidden">
                            <Link
                                href={`/servers/${server.gotoLink}/players/${player.id}`}
                                className="font-medium text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis hover:underline"
                            >
                                <PlayerName name={player.name} isAnonymous={player.is_anonymous} hiddenFromOthers={player.hidden_from_others} />
                            </Link>
                            <p className="text-xs text-muted-foreground leading-tight">
                                {t('playerStats', {hours: secondsToHours(player.total_playtime, locale), sessions: player.session_count})}
                            </p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function PopupBody({ isLoading, countryData, playerData, totalPlayers, page, position, error, onPageChange }: PlayerPopupState & { onPageChange: (page: number) => void }) {
    const t = useTranslations('radar.popup');
    const totalPages = Math.ceil(totalPlayers / PLAYERS_PER_PAGE);

    if (error) {
        const unknown = error === UNKNOWN_COUNTRY;
        return (
            <div className="flex flex-col items-center justify-center text-center py-2">
                {unknown ? <MapPinOff className="w-12 h-12 my-4" /> : <span className="text-3xl mb-2">⚠️</span>}
                <p className="font-medium text-sm">{unknown ? t('nothingFound') : t('error')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                    {unknown ? `${t('coordinates')} ${formatPosition(position)}` : error}
                </p>
            </div>
        );
    }
    if (isLoading) {
        return (
            <div className="flex justify-center items-center p-2">
                <Loader2 className="w-5 h-5 animate-spin mx-2" />
                <p className="text-xs ml-1.5">{t('loadingPlayers')}</p>
            </div>
        );
    }

    const code = countryData?.properties?.code;
    return <>
        <div className="flex items-center mb-1">
            {code && <img src={getFlagUrl(code)} alt={countryData.properties.name || 'Country Flag'} className="mr-4" />}
            <div>
                <h2 className="text-sm font-bold text-primary leading-tight m-0">
                    {countryData ? `${countryData.properties.name} (${countryData.properties.code})` : t('loading')}
                </h2>
                <p className="text-xs text-muted-foreground leading-tight">{formatPosition(position)}</p>
            </div>
        </div>

        <Separator className="my-1" />

        <h3 className="text-xs font-semibold mb-1">{t('players', {count: totalPlayers})}</h3>
        <div className="max-h-[270px] overflow-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            <PlayerList players={playerData} />
        </div>

        <div className="pagination-controls flex justify-center items-center mt-1">
            <PageButton disabled={page === 0} onClick={() => onPageChange(page - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
            </PageButton>
            <span className="text-xs mx-1">
                {page + 1} / {totalPages || 1}
            </span>
            <PageButton disabled={page + 1 === totalPages || totalPages === 0} onClick={() => onPageChange(page + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
            </PageButton>
        </div>
    </>;
}

export default function PlayerPopup(props: PlayerPopupState & { onPageChange: (page: number) => void }) {
    const { position } = props;
    return (
        <Popup
            // A new array every render re-opens the popup, so it re-pans to fit its content once loaded.
            position={[position.lat, position.lng]}
            closeOnClick={false}
            autoPan={true}
            maxWidth={250}
            minWidth={225}
            maxHeight={300}
            className="custom-player-popup"
        >
            <Card className="border-0 shadow-none p-1 card-solid">
                <CardContent className="p-0">
                    <PopupBody {...props} />
                </CardContent>
            </Card>
        </Popup>
    );
}
