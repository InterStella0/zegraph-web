'use client';
import 'leaflet/dist/leaflet.css';
import {LayersControl, MapContainer, TileLayer} from 'react-leaflet';
import {useTheme} from 'next-themes';
import L from 'leaflet';
import 'leaflet.nontiledlayer';
import NonTiledWMSLayer from 'components/radars/NonTiledWMSLayer';
import NightShadingLayer from 'components/radars/NightShadingLayer';
import {MapResizeHandler} from 'components/radars/leafletControls';
import {DARK_BASEMAP, LIGHT_BASEMAP, WMS_PLAYER_MAPPED_NOW_URL} from 'components/radars/RadarPreview';

const WORLD_BOUNDS = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));

export default function WorldRadarMap({refreshKey = 0}) {
    const isDark = useTheme().resolvedTheme === 'dark';

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
            maxBounds={WORLD_BOUNDS}
            maxBoundsViscosity={0.5}
            style={{height: '100%', width: '100%', background: 'transparent'}}
        >
            <MapResizeHandler />
            <TileLayer url={isDark ? DARK_BASEMAP : LIGHT_BASEMAP} />
            <LayersControl
                // @ts-ignore react-leaflet prop types clash with this @types/react version
                position="bottomleft"
            >
                <LayersControl.Overlay checked name="Night Shading">
                    <NightShadingLayer live />
                </LayersControl.Overlay>
                <LayersControl.Overlay checked name="Players">
                    <NonTiledWMSLayer
                        key={refreshKey}
                        url={WMS_PLAYER_MAPPED_NOW_URL}
                        layers="player_server_mapped"
                        version="1.1.1"
                        format="image/png"
                        transparent
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
