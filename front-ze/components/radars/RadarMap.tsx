import { useEffect, useRef } from "react";
import { useTheme } from 'next-themes';
import { useServerData } from "../../app/servers/[server_slug]/ServerDataProvider.tsx";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { LayersControl, MapContainer, TileLayer } from "react-leaflet";
import ThemedZoomControl from "components/radars/ThemedZoomControl.tsx";
import HomeButton from "components/radars/HomeButton.tsx";
import NonTiledWMSLayer from "components/radars/NonTiledWMSLayer";
import { darkBasemap, formWMSUrl, lightBasemap } from "components/radars/RadarPreview.tsx";
import { Button } from "components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "components/ui/tooltip";
import L from 'leaflet';  // L is used by nontiledlayer
import 'leaflet.nontiledlayer'
import { formatDateWMS } from "components/radars/TemporalController.tsx";
import { Dayjs } from "dayjs";


function formatDateDisplay(dateDisplay: { start: Dayjs, end: Dayjs }) {
    const startStr = formatDateWMS(dateDisplay.start);
    const endStr = formatDateWMS(dateDisplay.end);
    return `${startStr}/${endStr}`
}

export default function RadarMap({ dateDisplay, height, fullscreen = false }) {
    const { resolvedTheme } = useTheme();
    const center = [0, 0];
    const timedLayer = useRef(null);
    const maxLimit = dateDisplay ? dateDisplay.end.diff(dateDisplay.start, 'day') > 1 : true
    const isDarkMode = resolvedTheme === "dark";
    const zoom = fullscreen ? 2 : 1;
    const { server } = useServerData()
    const server_id = server.id

    const worldBounds = L.latLngBounds(
        L.latLng(-90, -180),
        L.latLng(90, 180)
    )

    useEffect(() => {
        const ref = timedLayer.current
        if (ref === null || dateDisplay === null || maxLimit) return

        ref.setParams({
            ...ref.options,
            TIME: formatDateDisplay(dateDisplay),
        });
    }, [maxLimit, timedLayer, dateDisplay, fullscreen]);

    return (
        <div className="relative">
            {maxLimit && (
                <div className="absolute inset-0 z-[1290]">
                    <div className="h-full flex flex-col justify-center items-center gap-4 bg-black/70">
                        <p className="font-semibold text-sm sm:text-base md:text-lg">
                            Time lookup cannot be higher than 1 day.
                        </p>
                        <div className="flex items-center gap-4">
                            <span className="font-semibold text-sm sm:text-base md:text-lg">Go to</span>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            asChild
                                            className={isDarkMode ? 'bg-black/50' : 'bg-black/25'}
                                        >
                                            <Link href={`/servers/${server_id}/radar`}>
                                                <ExternalLink className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Historical Radar</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <span className="font-semibold text-sm sm:text-base md:text-lg">instead.</span>
                        </div>
                    </div>
                </div>
            )}
            <div>
                <MapContainer
                    key={server_id}
                    // @ts-ignore (this is a dumb one)
                    center={center}
                    zoom={zoom}
                    style={{ height: height, width: '100%', cursor: 'default' }}
                    zoomControl={false}
                    zoomAnimation={true}
                    zoomAnimationThreshold={8}
                    fadeAnimation={true}
                    zoomDelta={0.25}
                    minZoom={fullscreen ? 2 : 1}
                    maxBounds={worldBounds}
                    maxBoundsViscosity={.5}
                    wheelPxPerZoomLevel={300}
                >
                    {fullscreen && <ThemedZoomControl />}
                    {fullscreen && <HomeButton />}
                    <LayersControl
                        // @ts-ignore it does exist bitch
                        position="bottomleft">
                        <LayersControl.BaseLayer name="Light Basemap" checked={!isDarkMode}>
                            <TileLayer
                                url={lightBasemap}
                                // @ts-ignore it does exist bitch
                                attribution="&copy; OpenStreetMap contributors"
                            />
                        </LayersControl.BaseLayer>
                        <LayersControl.BaseLayer name="Dark Basemap" checked={isDarkMode}>
                            <TileLayer
                                url={darkBasemap}
                                // @ts-ignore it does exist bitch
                                attribution="&copy; CartoDB"
                            />
                        </LayersControl.BaseLayer>

                        <LayersControl.Overlay checked={false} name="Live Players">
                            <NonTiledWMSLayer
                                url={formWMSUrl(server?.id, true)}
                                layers="player_server_mapped"
                                version="1.1.1"
                                format="image/png"
                                transparent={true}
                                opacity={0.8}
                                attribution="© queeniemella"
                                zIndex={20}
                            />
                        </LayersControl.Overlay>

                        <LayersControl.Overlay checked={true} name="Historical Players">
                            {!maxLimit && <NonTiledWMSLayer
                                url={formWMSUrl(server?.id, false, !maxLimit ? formatDateDisplay(dateDisplay) : '')}
                                ref={timedLayer}
                                layers="player_server_timed"
                                version="1.1.1"
                                format="image/png"
                                transparent={true}
                                opacity={0.8}
                                attribution="© queeniemella"
                                zIndex={20}
                            />}
                        </LayersControl.Overlay>
                        <LayersControl.Overlay checked={true} name="Countries">
                            <TileLayer
                                url={`/tiles/countries_${isDarkMode ? 'dark' : 'light'}/{z}/{x}/{y}.png`}
                                // @ts-ignore it does exist bitch
                                attribution="© queeniemella"
                                zIndex={15}
                            />
                        </LayersControl.Overlay>
                    </LayersControl>
                </MapContainer>
            </div>
        </div>
    );
}
