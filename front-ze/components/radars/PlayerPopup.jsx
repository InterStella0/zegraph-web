import { Popup } from 'react-leaflet';
import PlayerPopupContent from './PlayerPopupContent.tsx';
import './PlayerPopup.css';

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
                     }) => {
    // Calculate total pages
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
            onClose={onClose}
            className="custom-player-popup"
        >
            <div className="player-popup-container">
                <PlayerPopupContent
                    isLoading={isLoading}
                    countryData={countryData}
                    currentPlayers={playerData}
                    totalPlayers={totalPlayers}
                    page={page + 1} // Converting 0-based to 1-based for display
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