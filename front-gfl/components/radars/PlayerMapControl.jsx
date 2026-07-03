import {useContext, useState, useEffect, useRef} from 'react';
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

    // Discards responses that resolve after a newer request has started.
    const requestSeqRef = useRef(0);
    const refreshTimerRef = useRef(null);
    // Latest-value refs so the debounced refresh reads current state, not the
    // closure from when its timer was set.
    const clickedLocationRef = useRef(null);
    clickedLocationRef.current = clickedLocation;
    const pageRef = useRef(0);
    pageRef.current = page;

    const queryLocation = (latlng, page) =>
        !temporal.data?.isLive ? fetchUrl(`/radars/${server_id}/query`, {
            params: {
                latitude: latlng.lat,
                longitude: latlng.lng,
                page,
                time: temporal.data.cursor.toISOString(),
                interval: intervalToServer(temporal.data.interval)
            }
        }): fetchUrl(`/radars/${server_id}/live_query`, {
            params: {
                latitude: latlng.lat,
                longitude: latlng.lng,
                page
            }
        });

    // Time moved (live tick, play, step, scrub) while a popup is open: refresh
    // its list in place instead of closing it. Silent — no loading spinner, keep
    // the old list until new data lands, never nuke the popup on a failed refresh.
    useEffect(() => {
        if (!clickedLocationRef.current) return;

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(async () => {
            const latlng = clickedLocationRef.current;
            if (!latlng) return;

            const seq = ++requestSeqRef.current;
            try {
                let result = await queryLocation(latlng, pageRef.current);
                if (seq !== requestSeqRef.current) return;
                if (result.code === "Unknown") return;

                // Current page fell out of range (players left) — snap back to page 0.
                if (!result.players?.length && pageRef.current > 0) {
                    result = await queryLocation(latlng, 0);
                    if (seq !== requestSeqRef.current) return;
                    setPage(0);
                }

                setPlayerData(result.players || []);
                setTotalPlayers(result.count || 0);
                setError(null);
            } catch (error) {
                console.error('Error refreshing popup data:', error);
            }
        }, 400);

        return () => clearTimeout(refreshTimerRef.current);
    }, [temporal.data.cursor, temporal.data.interval, temporal.data.isLive]);

    const handleMapClick = async (e) => {
        const latlng = e.latlng;

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

        // Reset states for new location
        setCountryData(null);
        setPlayerData([]);
        setTotalPlayers(0);
        setPage(0);
        setError(null);

        // Set new location and loading state
        setClickedLocation(latlng);
        setIsLoading(true);
        const seq = ++requestSeqRef.current;
        try {
            const result = await queryLocation(latlng, 0);
            if (seq !== requestSeqRef.current) return;
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
            if (seq !== requestSeqRef.current) return;
            if (error.message !== "Unknown country selected")
                console.error('Error fetching data:', error);
            setError(error.message);
        } finally {
            if (seq === requestSeqRef.current) setIsLoading(false);
        }
    };

    // Handle pagination
    const handlePageChange = async (newPage) => {
        if (!clickedLocation) return;

        setIsLoading(true);
        const seq = ++requestSeqRef.current;
        try {
            const result = await queryLocation(clickedLocation, newPage);
            if (seq !== requestSeqRef.current) return;

            if (result.players) {
                setPlayerData(result.players);
                setTotalPlayers(result.count || 0);
                setPage(newPage);
            }
        } catch (error) {
            console.error('Error changing page:', error);
        } finally {
            if (seq === requestSeqRef.current) setIsLoading(false);
        }
    };

    const MapClickHandler = () => {
        useMapEvents({
            click: handleMapClick
        });
        return null;
    };

    const handlePopupClose = () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
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
