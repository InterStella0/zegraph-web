'use client'
// @ts-nocheck
import {ReactElement, useEffect, useRef, useState} from "react";
import dayjs from "dayjs";
import L from "leaflet/dist/leaflet-src";
import {LayersControl, MapContainer, TileLayer} from "react-leaflet";
import InfoMessage from "components/radars/InfoMessage.tsx";
import ThemedZoomControl from "components/radars/ThemedZoomControl.tsx";
import HomeButton from "components/radars/HomeButton.tsx";
import {darkBasemap, formWMSUrl, lightBasemap} from "components/radars/RadarPreview.tsx";
import NonTiledWMSLayer from "components/radars/NonTiledWMSLayer";
import TemporalController, {TemporalContext, TemporalData} from "components/radars/TemporalController.tsx";
import StatsComponent from "components/radars/StatComponents.tsx";
import LegendControl from "components/radars/Legend.tsx";
import PlayerMapControl from "components/radars/PlayerMapControl";
import {useServerData} from "../ServerDataProvider";
import {useTheme} from "next-themes";
import { useTranslations } from 'next-intl';

export default function Radar(): ReactElement {
    const {server} = useServerData()
    const t = useTranslations('radar');
    const { resolvedTheme } = useTheme();
    const countryWMSRef = useRef(null)
    const wmsLayerRef = useRef([]);
    const [ temporal, setTemporal ] = useState<TemporalData>({ cursor: dayjs(), interval: '10min', isLive: true})
    const isDarkMode = resolvedTheme === 'dark';
    const center = [0, 0];
    const zoom   = 2;
    const worldBounds = L.latLngBounds(
        L.latLng(-90, -180),
        L.latLng(90, 180)
    );

    const addWmsLayerRef = (ref) => {
        if (ref && !wmsLayerRef.current.includes(ref)) {
            wmsLayerRef.current.push(ref);
        }
    };
    useEffect(() => {
        const ref = countryWMSRef.current
        if (!ref) return

        ref.setParams({
            ...ref.options,
            STYLES: isDarkMode? 'light': 'dark'
        })
    }, [isDarkMode, countryWMSRef])

    return <>
        <div className="relative h-[calc(100vh-72px)] w-full [&_.leaflet-bottom.leaflet-left]:mb-[236px] md:[&_.leaflet-bottom.leaflet-left]:mb-[96px]">
        <TemporalContext value={{ data: temporal, set: setTemporal }}>
            <MapContainer
                // @ts-ignore
                center={center}
                zoom={zoom} style={{ height: 'calc(100vh - 72px)', width: '100%', cursor: 'default' }} zoomControl={false}
                zoomAnimation={true}
                zoomAnimationThreshold={8}
                fadeAnimation={true}
                zoomDelta={0.25}
                minZoom={2}
                maxBounds={worldBounds}
                maxBoundsViscosity={.5}
                wheelPxPerZoomLevel={300}
            >
                <InfoMessage />
                <ThemedZoomControl />
                <HomeButton />
                <LayersControl
                    // @ts-ignore
                    position="bottomleft">
                    <LayersControl.BaseLayer name={t('layers.lightBasemap')} checked={!isDarkMode}>
                        <TileLayer
                            url={lightBasemap}
                            // @ts-ignore
                            attribution="&copy; OpenStreetMap contributors"
                            zIndex={20}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name={t('layers.darkBasemap')} checked={isDarkMode}>
                        <TileLayer
                            url={darkBasemap}
                            // @ts-ignore
                            attribution="&copy; CartoDB"
                            zIndex={20}
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.Overlay checked={temporal.isLive} name={t('layers.livePlayers')}>
                        <NonTiledWMSLayer
                            url={formWMSUrl(server?.id, true)}
                            layers="player_server_mapped"
                            version="1.1.1"
                            format="image/png"
                            transparent={true}
                            opacity={0.8}
                            attribution="&copy; queeniemella"
                            zIndex={20}
                        />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay checked={!temporal.isLive} name={t('layers.historicalPlayers')}>
                        <NonTiledWMSLayer
                            ref={addWmsLayerRef}
                            url={formWMSUrl(server?.id, false)}
                            layers="player_server_timed"
                            version="1.1.1"
                            format="image/png"
                            transparent={true}
                            opacity={0.8}
                            attribution="&copy; queeniemella"
                            zIndex={20}
                        />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay checked={true} name={t('layers.countries')}>
                        <TileLayer
                            url={`/tiles/countries_${isDarkMode ? 'dark' : 'light'}/{z}/{x}/{y}.png`}
                            // @ts-ignore
                            attribution="&copy; queeniemella"
                            zIndex={16}
                        />
                    </LayersControl.Overlay>
                </LayersControl>
                <StatsComponent />
                <LegendControl />
                <PlayerMapControl />
            </MapContainer>
            <TemporalController
                wmsLayerRef={wmsLayerRef}
                initialStartDate={dayjs("2024-05-12T03:15:00Z")} // I know my data starts here so.
                initialEndDate={dayjs()}
            />
        </TemporalContext>
        </div>
    </>
};