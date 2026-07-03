import {useContext, useState, useEffect} from 'react';
import { useMapEvents } from 'react-leaflet';
import CountryPolygon from "./CountryPolygon.tsx";
import PlayerPopup from "./PlayerPopup.jsx";
import {fetchUrl, intervalToServer} from "utils/generalUtils.ts";
import {TemporalContext} from "./TemporalController.tsx";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";

const PlayerMapControl = () => {
    const [clickedLocation, setClickedLocation] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [countryData, setCountryData] = useState(null);
    const [playerData, setPlayerData] = useState([]);
    const [totalPlayers, setTotalPlayers] = useState(0);
    const [page, setPage] = useState(0);
    const [error, setError] = useState(null);
    const { server } = useServerData()
    const server_id = server.id
    const temporal = useContext(TemporalContext);

    useEffect(() => {
        if (clickedLocation) {
            handlePopupClose();
        }
    }, [temporal.data.cursor, temporal.data.interval]);

    const handleMapClick = async (e) => {
        const latlng = e.latlng;

        // Reset states for new location
        setCountryData(null);
        setPlayerData([]);
        setTotalPlayers(0);
        setPage(0);
        setError(null);

        // Set new location and loading state
        setClickedLocation(latlng);
        setIsLoading(true);
        try {
            const promise = !temporal.data?.isLive? fetchUrl(`/radars/${server_id}/query`, {
                params: {
                    latitude: latlng.lat,
                    longitude: latlng.lng,
                    page: 0,
                    time: temporal.data.cursor.toISOString(),
                    interval: intervalToServer(temporal.data.interval)
                }
            }): fetchUrl(`/radars/${server_id}/live_query`, {
                params: {
                    latitude: latlng.lat,
                    longitude: latlng.lng,
                    page: 0
                }
            })
            const result = await promise
            if (result.code === "Unknown") {
                throw new Error("Unknown country selected");
            }

            // Only process geometry if available
            if (result.geojson) {
                const geometry = JSON.parse(result.geojson);
                const countryGeoJson = {
                    type: 'Feature',
                    properties: {
                        name: result.name,
                        code: result.code
                    },
                    geometry
                };
                setCountryData(countryGeoJson);
            }

            setPlayerData(result.players || []);
            setTotalPlayers(result.count || 0);

        } catch (error) {
            if (error.message !== "Unknown country selected")
                console.error('Error fetching data:', error);
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle pagination
    const handlePageChange = async (newPage) => {
        if (!clickedLocation) return;

        setIsLoading(true);
        try {
            const promise = !temporal.data?.isLive? fetchUrl(`/radars/${server_id}/query`, {
                params: {
                    latitude: clickedLocation.lat,
                    longitude: clickedLocation.lng,
                    page: newPage,
                    time: temporal.data.cursor.toISOString(),
                    interval: intervalToServer(temporal.data.interval)
                }
            }): fetchUrl(`/radars/${server_id}/live_query`, {
                params: {
                    latitude: clickedLocation.lat,
                    longitude: clickedLocation.lng,
                    page: newPage
                }
            })
            const result = await promise

            if (result.players) {
                setPlayerData(result.players);
                setTotalPlayers(result.count || 0);
                setPage(newPage);
            }
        } catch (error) {
            console.error('Error changing page:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const MapClickHandler = () => {
        useMapEvents({
            click: handleMapClick
        });
        return null;
    };

    const handlePopupClose = () => {
        setClickedLocation(null);
        setCountryData(null);
        setPlayerData([]);
        setTotalPlayers(0);
        setPage(0);
        setError(null);
    };


    return (
        <>
            <MapClickHandler />

            {countryData && (
                <CountryPolygon
                    geoJsonData={countryData}
                />
            )}

            {clickedLocation && (
                <PlayerPopup
                    position={clickedLocation}
                    isLoading={isLoading}
                    countryData={countryData}
                    playerData={playerData}
                    totalPlayers={totalPlayers}
                    page={page}
                    error={error}
                    onPageChange={handlePageChange}
                    onClose={handlePopupClose}
                />
            )}
        </>
    );
};

export default PlayerMapControl;