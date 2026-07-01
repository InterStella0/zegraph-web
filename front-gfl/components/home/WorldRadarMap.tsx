'use client';
// @ts-nocheck
import 'leaflet/dist/leaflet.css';
import {useMemo} from 'react';
import {LayersControl, MapContainer, TileLayer} from 'react-leaflet';
import {useTheme} from 'next-themes';
import dayjs from 'dayjs';
import L from 'leaflet';
import 'leaflet.nontiledlayer';
import NonTiledWMSLayer from 'components/radars/NonTiledWMSLayer';
import {darkBasemap, formGlobalWMSUrl, lightBasemap} from 'components/radars/RadarPreview';
import {formatDateWMS} from 'components/radars/TemporalController';

// Landing-page world map: renders the QGIS WMS player layer for ALL servers (no server_id
// filter), filtered by a recent time window only. `refreshKey` lets the parent bump the
// window periodically so it stays roughly live.
export default function WorldRadarMap({refreshKey = 0, windowMinutes = 15}) {
    const {resolvedTheme} = useTheme();
    const isDark = resolvedTheme === 'dark';

    const worldBounds = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));

    const time = useMemo(() => {
        const end = dayjs();
        const start = end.subtract(windowMinutes, 'minute');
        return `${formatDateWMS(start)}/${formatDateWMS(end)}`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey, windowMinutes]);

    return (
        <MapContainer
            center={[25, 5]}
            zoom={1}
            minZoom={1}
            maxZoom={4}
            zoomControl={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            dragging={false}
            attributionControl={false}
            maxBounds={worldBounds}
            maxBoundsViscosity={0.5}
            style={{height: '100%', width: '100%', background: 'transparent'}}
        >
            <TileLayer url={isDark ? darkBasemap : lightBasemap} />
            <LayersControl position="bottomleft">
                <LayersControl.Overlay checked name="Players">
                    <NonTiledWMSLayer
                        key={time}
                        url={formGlobalWMSUrl(time)}
                        layers="player_server_timed"
                        version="1.1.1"
                        format="image/png"
                        transparent={true}
                        opacity={0.85}
                        attribution="© queeniemella"
                        zIndex={20}
                    />
                </LayersControl.Overlay>
                <LayersControl.Overlay checked name="Countries">
                    <TileLayer
                        url={`/tiles/countries_${isDark ? 'dark' : 'light'}/{z}/{x}/{y}.png`}
                        attribution="© queeniemella"
                        zIndex={15}
                    />
                </LayersControl.Overlay>
            </LayersControl>
        </MapContainer>
    );
}
