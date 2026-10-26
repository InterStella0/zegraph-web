import {useContext, useState, useEffect} from 'react';
import { GeoJSON, useMapEvents } from 'react-leaflet';
import type { LatLng } from 'leaflet';
import PlayerPopup, {PlayerPopupState, UNKNOWN_COUNTRY} from "./PlayerPopup.tsx";
import {fetchUrl, intervalToServer} from "utils/generalUtils.ts";
import {TemporalContext, TemporalData} from "./TemporalController.tsx";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import type {CountryPlayers} from "types/radars";

const COUNTRY_PATH_OPTIONS = {
    style: { fillColor: 'var(--primary)', weight: 2, opacity: 1, color: 'var(--primary)', fillOpacity: 0.3 },
    interactive: false,
    bubblingMouseEvents: true,
};

function queryCountry(serverId: string, temporal: TemporalData, position: LatLng, page: number): Promise<CountryPlayers> {
    const params = { latitude: position.lat, longitude: position.lng, page };
    if (temporal.isLive)
        return fetchUrl(`/radars/${serverId}/live_query`, { params });
    return fetchUrl(`/radars/${serverId}/query`, {
        params: { ...params, time: temporal.cursor.toISOString(), interval: intervalToServer(temporal.interval) },
    });
}

export default function PlayerMapControl() {
    const { server } = useServerData()
    const { data: temporal } = useContext(TemporalContext);
    const [popup, setPopup] = useState<PlayerPopupState | null>(null);
    // A response only lands on the popup it was requested for.
    const update = (position: LatLng, patch: Partial<PlayerPopupState>) =>
        setPopup(current => current?.position === position ? { ...current, ...patch } : current);

    useEffect(() => {
        setPopup(null);
    }, [temporal.cursor, temporal.interval]);

    useMapEvents({
        click: async ({ latlng }) => {
            setPopup({ position: latlng, isLoading: true, countryData: null, playerData: [], totalPlayers: 0, page: 0, error: null });
            try {
                const result = await queryCountry(server.id, temporal, latlng, 0);
                if (result.code === "Unknown") throw new Error(UNKNOWN_COUNTRY);
                update(latlng, {
                    isLoading: false,
                    countryData: result.geojson
                        ? { type: 'Feature', properties: { name: result.name, code: result.code }, geometry: JSON.parse(result.geojson) }
                        : null,
                    playerData: result.players || [],
                    totalPlayers: result.count || 0,
                });
            } catch (err) {
                if (err.message !== UNKNOWN_COUNTRY)
                    console.error('Error fetching data:', err);
                update(latlng, { isLoading: false, error: err.message });
            }
        },
    });

    const handlePageChange = async (page: number) => {
        const { position } = popup;
        update(position, { isLoading: true });
        try {
            const result = await queryCountry(server.id, temporal, position, page);
            if (result.players)
                update(position, { playerData: result.players, totalPlayers: result.count || 0, page });
        } catch (err) {
            console.error('Error changing page:', err);
        } finally {
            update(position, { isLoading: false });
        }
    };

    return <>
        {popup?.countryData && <GeoJSON data={popup.countryData} pathOptions={COUNTRY_PATH_OPTIONS} />}
        {popup && <PlayerPopup {...popup} onPageChange={handlePageChange} />}
    </>;
}
