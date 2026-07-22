'use client';
import 'leaflet/dist/leaflet.css';
import {useEffect, useMemo} from 'react';
import {LayersControl, MapContainer, TileLayer, useMap} from 'react-leaflet';
import {useTheme} from 'next-themes';
import dayjs from 'dayjs';
import L from 'leaflet';
import 'leaflet.nontiledlayer';
import NonTiledWMSLayer from 'components/radars/NonTiledWMSLayer';
import {darkBasemap, formGlobalWMSUrl, lightBasemap} from 'components/radars/RadarPreview';
import {formatDateWMS} from 'components/radars/TemporalController';

// The card can be resized by the parent layout (e.g. expand toggle), but Leaflet only
// measures its container on mount, so we watch for size changes and re-measure.
function MapResizeHandler() {
    const map = useMap();
    useEffect(() => {
        const container = map.getContainer();
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(container);
        return () => observer.disconnect();
    }, [map]);
    return null;
}

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
            // @ts-ignore react-leaflet prop types clash with this @types/react version
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
            <MapResizeHandler />
            <TileLayer url={isDark ? darkBasemap : lightBasemap} />
            <LayersControl
                // @ts-ignore react-leaflet prop types clash with this @types/react version
                position="bottomleft"
            >
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
                        // @ts-ignore react-leaflet prop types clash with this @types/react version
                        attribution="© queeniemella"
                        zIndex={15}
                    />
                </LayersControl.Overlay>
            </LayersControl>
        </MapContainer>
    );
}
