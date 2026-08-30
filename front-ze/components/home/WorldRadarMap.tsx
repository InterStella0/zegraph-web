'use client';
import 'leaflet/dist/leaflet.css';
import {useEffect} from 'react';
import {LayersControl, MapContainer, TileLayer, useMap} from 'react-leaflet';
import {useTheme} from 'next-themes';
import L from 'leaflet';
import 'leaflet.nontiledlayer';
import NonTiledWMSLayer from 'components/radars/NonTiledWMSLayer';
import {DARK_BASEMAP, LIGHT_BASEMAP, WMS_PLAYER_MAPPED_NOW_URL} from 'components/radars/RadarPreview';

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

export default function WorldRadarMap({refreshKey = 0}) {
    const {resolvedTheme} = useTheme();
    const isDark = resolvedTheme === 'dark';

    const worldBounds = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));

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
            <TileLayer url={isDark ? DARK_BASEMAP : LIGHT_BASEMAP} />
            <LayersControl
                // @ts-ignore react-leaflet prop types clash with this @types/react version
                position="bottomleft"
            >
                <LayersControl.Overlay checked name="Players">
                    <NonTiledWMSLayer
                        key={refreshKey}
                        url={WMS_PLAYER_MAPPED_NOW_URL}
                        layers="player_server_mapped"
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
