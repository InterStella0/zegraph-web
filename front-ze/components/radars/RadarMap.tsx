import { ReactNode, useEffect, useRef } from "react";
import { useTheme } from 'next-themes';
import { useServerData } from "../../app/servers/[server_slug]/ServerDataProvider.tsx";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { LayersControl, MapContainer, TileLayer } from "react-leaflet";
import { HomeButton, MapResizeHandler, ThemedZoomControl } from "components/radars/leafletControls";
import NonTiledWMSLayer from "components/radars/NonTiledWMSLayer";
import { DARK_BASEMAP, LIGHT_BASEMAP, playerWMS, wmsTimeRange } from "components/radars/RadarPreview.tsx";
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/ui/tooltip";
import L from 'leaflet';
import NightShadingLayer from "components/radars/NightShadingLayer.tsx";
import type { Dayjs } from "lib/dayjs";

const WORLD_BOUNDS = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));

export const midpoint = (start: Dayjs, end: Dayjs) => start.add(end.diff(start) / 2, 'millisecond');

export function RadarMapContainer({ zoom, height, children }: { zoom: number, height: string, children: ReactNode }) {
    return (
        <MapContainer
            // @ts-ignore react-leaflet prop types clash with this @types/react version
            center={[0, 0]}
            zoom={zoom}
            minZoom={zoom}
            style={{ height, width: '100%', cursor: 'default' }}
            zoomControl={false}
            zoomAnimation={true}
            zoomAnimationThreshold={8}
            fadeAnimation={true}
            zoomDelta={0.25}
            maxBounds={WORLD_BOUNDS}
            maxBoundsViscosity={.5}
            wheelPxPerZoomLevel={300}
        >
            <MapResizeHandler />
            {children}
        </MapContainer>
    );
}

/** The light/dark basemap pair; 1 is Leaflet's default tile zIndex. */
export function BasemapLayers({ isDarkMode, names: [lightName, darkName], zIndex = 1 }: { isDarkMode: boolean, names: [string, string], zIndex?: number }) {
    return <>
        <LayersControl.BaseLayer name={lightName} checked={!isDarkMode}>
            <TileLayer url={LIGHT_BASEMAP} attribution="&copy; OpenStreetMap contributors" zIndex={zIndex} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={darkName} checked={isDarkMode}>
            <TileLayer
                url={DARK_BASEMAP}
                attribution={`&copy; <a href="https://basemap.queeniemella.cc/">queeniemella</a>, &copy; OpenStreetMap contributors`}
                zIndex={zIndex}
            />
        </LayersControl.BaseLayer>
    </>
}

export function CountriesOverlay({ name, isDarkMode, zIndex }: { name: string, isDarkMode: boolean, zIndex: number }) {
    return (
        <LayersControl.Overlay checked={true} name={name}>
            <TileLayer url={`/tiles/countries_${isDarkMode ? 'dark' : 'light'}/{z}/{x}/{y}.png`} attribution="&copy; queeniemella" zIndex={zIndex} />
        </LayersControl.Overlay>
    );
}

export default function RadarMap({ dateDisplay, height, fullscreen = false }) {
    const { resolvedTheme } = useTheme();
    const timedLayer = useRef(null);
    const maxLimit = dateDisplay ? dateDisplay.end.diff(dateDisplay.start, 'day') > 1 : true
    const nightShadingTime = dateDisplay ? midpoint(dateDisplay.start, dateDisplay.end) : undefined
    const nightShadingChecked = dateDisplay ? dateDisplay.end.diff(dateDisplay.start, 'minute') <= 60 : true
    const isDarkMode = resolvedTheme === "dark";
    const { server } = useServerData()

    useEffect(() => {
        const layer = timedLayer.current
        if (layer === null || maxLimit) return

        layer.setParams({
            ...layer.options,
            TIME: wmsTimeRange(dateDisplay.start, dateDisplay.end),
        });
    }, [maxLimit, timedLayer, dateDisplay, fullscreen]);

    return (
        <div className="relative h-full">
            {maxLimit && (
                <div className="absolute inset-0 z-[1290]">
                    <div className="h-full flex flex-col justify-center items-center gap-4 bg-black/70">
                        <p className="font-semibold text-sm sm:text-base md:text-lg">
                            Time lookup cannot be higher than 1 day.
                        </p>
                        <div className="flex items-center gap-4">
                            <span className="font-semibold text-sm sm:text-base md:text-lg">Go to</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        asChild
                                        className={isDarkMode ? 'bg-black/50' : 'bg-black/25'}
                                    >
                                        <Link href={`/servers/${server.id}/radar`}>
                                            <ExternalLink className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Historical Radar</TooltipContent>
                            </Tooltip>
                            <span className="font-semibold text-sm sm:text-base md:text-lg">instead.</span>
                        </div>
                    </div>
                </div>
            )}
            <RadarMapContainer key={server.id} zoom={fullscreen ? 2 : 1} height={height}>
                {fullscreen && <>
                    <ThemedZoomControl />
                    <HomeButton />
                </>}
                <LayersControl
                    // @ts-ignore react-leaflet prop types clash with this @types/react version
                    position="bottomleft">
                    <BasemapLayers isDarkMode={isDarkMode} names={['Light Basemap', 'Dark Basemap']} />
                    <LayersControl.Overlay checked={nightShadingChecked} name="Night Shading">
                        <NightShadingLayer time={nightShadingTime} live={!dateDisplay} />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay checked={false} name="Live Players">
                        <NonTiledWMSLayer {...playerWMS(server?.id, true)} />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay checked={true} name="Historical Players">
                        {!maxLimit && <NonTiledWMSLayer
                            ref={timedLayer}
                            {...playerWMS(server?.id, false, wmsTimeRange(dateDisplay.start, dateDisplay.end))}
                        />}
                    </LayersControl.Overlay>
                    <CountriesOverlay name="Countries" isDarkMode={isDarkMode} zIndex={15} />
                </LayersControl>
            </RadarMapContainer>
        </div>
    );
}
