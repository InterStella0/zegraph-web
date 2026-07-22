import { Popup } from 'react-leaflet';
import type { LatLng } from 'leaflet';
import PlayerPopupContent from './PlayerPopupContent.tsx';
import type { CountryFeature, CountryPlayer } from 'types/radars';
import './PlayerPopup.css';

interface PlayerPopupProps {
    position: LatLng;
    isLoading: boolean;
    countryData: CountryFeature | null;
    playerData: CountryPlayer[];
    totalPlayers: number;
    page: number;
    error: string | null;
    onPageChange: (page: number) => void;
    onClose: () => void;
}

const PlayerPopup = ({
                         position,
                         isLoading,
                         countryData,
                         playerData,
                         totalPlayers,
                         page,
                         error,
                         onPageChange,
                         onClose
                     }: PlayerPopupProps) => {

    const PLAYERS_PER_PAGE = 10;
    const totalPages = Math.ceil(totalPlayers / PLAYERS_PER_PAGE);

    return (
        <Popup
            position={[position.lat, position.lng]}
            closeOnClick={false}
            autoPan={true}
            maxWidth={250}
            minWidth={225}
            maxHeight={300}
            // @ts-ignore leaflet has no onClose option, so this prop is inert
            onClose={onClose}
            className="custom-player-popup"
        >
            <div className="player-popup-container">
                <PlayerPopupContent
                    isLoading={isLoading}
                    countryData={countryData}
                    currentPlayers={playerData}
                    totalPlayers={totalPlayers}
                    page={page + 1}
                    totalPages={totalPages}
                    position={position}
                    error={error}
                    onPageChange={(newPage) => onPageChange(newPage - 1)}
                />
            </div>
        </Popup>
    );
};

export default PlayerPopup;