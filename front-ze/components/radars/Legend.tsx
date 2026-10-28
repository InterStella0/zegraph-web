import {useState} from "react";
import {Skeleton} from "components/ui/skeleton";
import {ChevronDown, ChevronUp, Globe} from "lucide-react";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "components/ui/collapsible";
import {useTheme} from "next-themes";
import {useTranslations} from 'next-intl';
import {withErrorCatch} from "components/common/withErrorCatch";
import {useResource} from "lib/hooks/useResource";
import {WMS_URL} from "./RadarPreview.tsx";
import {NIGHT_SHADING_STYLE} from "./NightShadingLayer.tsx";
import {useReactControl} from "./leafletControls";
import {TWILIGHT_ALTITUDES} from "utils/terminator.ts";

async function fetchLegend(name: string, style: string, signal: AbortSignal) {
    const params = {SERVICE: "WMS", REQUEST: "GetLegendGraphic", LAYERS: name, STYLES: style, FORMAT: "application/json"};
    const resp = await fetch(`${WMS_URL}?${new URLSearchParams(params)}`, {signal}).then(resp => resp.json());
    const node = resp.nodes[0];
    return node && {title: node.title, icon: node.symbols?.[0]?.icon ?? node.icon};
}

function WMSLegendImage({name, style = ""}){
    const {data} = useResource(signal => fetchLegend(name, style, signal), [name, style], {keepData: true});
    const title = data?.title ?? name;
    return <div className="flex flex-row gap-2 mt-3">
        {data ? <img width="20px" height="20px" src={`data:image/png;base64, ${data.icon}`} alt={title}/> : <Skeleton className="w-5 h-5" />}
        <p className="text-primary">{title}</p>
    </div>
}

function stackedFill(band: { fillColor: string, fillOpacity: number }): string {
    const alpha = 1 - (1 - band.fillOpacity) ** TWILIGHT_ALTITUDES.length;
    return `color-mix(in srgb, ${band.fillColor} ${(alpha * 100).toFixed(1)}%, transparent)`;
}

function NightShadingLegend({ label, isDarkMode }){
    const { basemap, night } = NIGHT_SHADING_STYLE[isDarkMode ? 'dark' : 'light'];
    return <div className="flex flex-row gap-2 mt-3">
        <div className="w-5 h-5 border" style={{
            backgroundColor: basemap,
            backgroundImage: `linear-gradient(to right, transparent 50%, ${stackedFill(night)} 50%)`,
        }} />
        <p className="text-primary">{label}</p>
    </div>
}

export function LegendEntries({ isDarkMode }: { isDarkMode: boolean }){
    const t = useTranslations('radar');
    return <>
        <WMSLegendImage name="player_server_timed" />
        <WMSLegendImage name="player_server_mapped" />
        <WMSLegendImage name={`countries_${isDarkMode ? "dark" : "light"}`} />
        <NightShadingLegend label={t('layers.nightShading')} isDarkMode={isDarkMode} />
    </>
}

function LegendPanel({ isDarkMode }: { isDarkMode: boolean }){
    const t = useTranslations('radar');
    const [ isExpanded, setExpanded ] = useState(true)
    return (
        <div className="backdrop-blur-[10px] bg-background border transition-all duration-300 max-w-[250px]">
            <Collapsible open={isExpanded}>
                <CollapsibleTrigger
                    className="flex items-center justify-between p-1.5 cursor-pointer w-auto gap-2 border-b border-accent"
                    onClick={(eve) => {
                        eve.stopPropagation()
                        setExpanded(e => !e)
                    }}
                >
                    <div className="flex items-center gap-2">
                        <Globe />
                        {isExpanded && <p className="text-primary font-semibold">{t('legend')}</p>}
                    </div>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="p-6 border-t border-black/5 dark:border-white/5 flex flex-col gap-1">
                        <LegendEntries isDarkMode={isDarkMode} />
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}

const SafeLegendPanel = withErrorCatch(LegendPanel, t => t('radar.legendError'));

export const SafeLegendEntries = withErrorCatch(LegendEntries, t => t('radar.legendError'));

export default function LegendControl(){
    // next-themes context does not reach the control's own React root.
    const { resolvedTheme } = useTheme();
    useReactControl(<SafeLegendPanel isDarkMode={resolvedTheme === "dark"} />, 'topright', 'leaflet-bar');
    return null;
}
