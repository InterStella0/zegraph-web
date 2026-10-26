'use client'
import {ReactElement, useRef, useState} from "react";
import dayjs from "lib/dayjs";
import {LayersControl} from "react-leaflet";
import InfoMessage from "components/radars/InfoMessage.tsx";
import {HomeButton, ThemedZoomControl} from "components/radars/leafletControls";
import {playerWMS} from "components/radars/RadarPreview.tsx";
import {BasemapLayers, CountriesOverlay, midpoint, RadarMapContainer} from "components/radars/RadarMap.tsx";
import NonTiledWMSLayer from "components/radars/NonTiledWMSLayer";
import TemporalController, {TemporalContext, TemporalData} from "components/radars/TemporalController.tsx";
import StatsComponent from "components/radars/StatComponents.tsx";
import LegendControl from "components/radars/Legend.tsx";
import PlayerMapControl from "components/radars/PlayerMapControl";
import NightShadingLayer from "components/radars/NightShadingLayer.tsx";
import {getIntervalCallback} from "utils/generalUtils.ts";
import {useServerData} from "../ServerDataProvider";
import {useTheme} from "next-themes";
import { useTranslations } from 'next-intl';

export default function Radar(): ReactElement {
    const {server} = useServerData()
    const t = useTranslations('radar');
    const { resolvedTheme } = useTheme();
    const wmsLayerRef = useRef([]);
    const [ temporal, setTemporal ] = useState<TemporalData>({ cursor: dayjs(), interval: '10min', isLive: true})
    const isDarkMode = resolvedTheme === 'dark';
    const nightShadingTime = midpoint(temporal.cursor, getIntervalCallback(temporal.interval)(temporal.cursor));

    const addWmsLayerRef = (ref) => {
        if (ref && !wmsLayerRef.current.includes(ref)) {
            wmsLayerRef.current.push(ref);
        }
    };

    return (
        <div className="relative h-[calc(100vh-72px)] w-full [&_.leaflet-top.leaflet-right]:left-0 [&_.leaflet-bottom.leaflet-left]:mb-[236px] md:[&_.leaflet-bottom.leaflet-left]:mb-[96px]">
            <TemporalContext value={{ data: temporal, set: setTemporal }}>
                <RadarMapContainer zoom={2} height="calc(100vh - 72px)">
                    <InfoMessage />
                    <ThemedZoomControl />
                    <HomeButton />
                    <LayersControl
                        // @ts-ignore react-leaflet prop types clash with this @types/react version
                        position="bottomleft">
                        <BasemapLayers isDarkMode={isDarkMode} names={[t('layers.lightBasemap'), t('layers.darkBasemap')]} zIndex={20} />
                        <LayersControl.Overlay checked={['10min', '30min', '1hour'].includes(temporal.interval)} name={t('layers.nightShading')}>
                            <NightShadingLayer time={nightShadingTime} live={temporal.isLive} />
                        </LayersControl.Overlay>
                        <LayersControl.Overlay checked={temporal.isLive} name={t('layers.livePlayers')}>
                            <NonTiledWMSLayer {...playerWMS(server?.id, true)} />
                        </LayersControl.Overlay>
                        <LayersControl.Overlay checked={!temporal.isLive} name={t('layers.historicalPlayers')}>
                            <NonTiledWMSLayer ref={addWmsLayerRef} {...playerWMS(server?.id, false)} />
                        </LayersControl.Overlay>
                        <CountriesOverlay name={t('layers.countries')} isDarkMode={isDarkMode} zIndex={16} />
                    </LayersControl>
                    <StatsComponent />
                    <LegendControl />
                    <PlayerMapControl />
                </RadarMapContainer>
                <TemporalController
                    wmsLayerRef={wmsLayerRef}
                    initialStartDate={dayjs("2024-05-12T03:15:00Z")} // I know my data starts here so.
                    initialEndDate={dayjs()}
                />
            </TemporalContext>
        </div>
    );
};
