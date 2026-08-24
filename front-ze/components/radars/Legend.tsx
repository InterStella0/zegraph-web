import {createControlComponent} from "@react-leaflet/core";
import {DomUtil} from "leaflet";
import ReactDOM from "react-dom/client";
import {useEffect, useRef, useState} from "react";
import L from 'leaflet'
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {WMS_URL} from "./RadarPreview.tsx";
import {Skeleton} from "components/ui/skeleton";
import {ChevronDown, ChevronUp, Globe} from "lucide-react";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "components/ui/collapsible";
import {useTheme} from "next-themes";
import {useTranslations} from 'next-intl';



function LegendWrapper({ setUpdateFn }) {
    const [data, setData] = useState<{theme: string, legendLabel: string, errorLabel: string | null}>({theme: 'light', legendLabel: null, errorLabel: null});
    useEffect(() => {
        setUpdateFn(setData);
    }, [setUpdateFn]);

    return <ErrorCatch message={data.errorLabel ?? "Error showing legend :/"}>
        <LegendWrapped reactData={data} />
    </ErrorCatch>
}
function WMSLegendImage({name, style = ""}){
    const [title, setTitle] = useState(name)
    const [ imageSrc, setImage ] = useState(null)

    useEffect(() => {
        const params = {
            SERVICE: "WMS",
            REQUEST: "GetLegendGraphic",
            LAYERS: name,
            STYLES: style,
            FORMAT: "application/json"
        }
        const url = `${WMS_URL}?${new URLSearchParams(params).toString()}`
        fetch(url)
            .then(resp => resp.json())
            .then(resp => {
                for(const node of resp.nodes){
                    setTitle(node.title)
                    if (node.symbols){
                        for (const symbol of node.symbols){
                            setImage(`data:image/png;base64, ${symbol.icon}`)
                            return
                        }
                    }
                    setImage(`data:image/png;base64, ${node.icon}`)
                    return // Just get first lol
                }
            })

    }, [name, style]);
    return <div className="flex flex-row gap-2 mt-3">
        {imageSrc? <img width="20px" height="20px" src={imageSrc} alt={title}/>: <Skeleton className="w-5 h-5" />}
        <p className="text-primary">{title}</p>
    </div>
}

function LegendWrapped({ reactData }){
    const { resolvedTheme } = useTheme()
    const isDarkMode = resolvedTheme === "dark"
    const [ isExpanded, setExpanded ] = useState(true)
    return <>
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
                        {isExpanded && (
                            <p className="text-primary font-semibold">{reactData?.legendLabel ?? "Legend"}</p>
                        )}
                    </div>

                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="p-6 border-t border-black/5 dark:border-white/5 flex flex-col gap-1">
                        <WMSLegendImage name="player_server_timed" />
                        <WMSLegendImage name="player_server_mapped" />
                        <WMSLegendImage name={`countries_${isDarkMode ? "dark" : "light"}`} />
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    </>
}

const LegendControlExtends = L.Control.extend({
    initialize: function(options) {
        L.Util.setOptions(this, options)
        this._container = null;
        this._setReactDataFn = () => {}
    },
    updateData: function(data){
        if (this._setReactDataFn) {
            this._setReactDataFn(data);
        }
    },
    onAdd: function(_map) {
        this._container = DomUtil.create('div', 'leaflet-control leaflet-bar');

        L.DomEvent.disableClickPropagation(this._container);
        L.DomEvent.disableScrollPropagation(this._container);

        const reactRoot = ReactDOM.createRoot(this._container);
        reactRoot.render(<LegendWrapper setUpdateFn={(fn) => {
            this._setReactDataFn = fn;
            fn({theme: this.options.theme, legendLabel: this.options.legendLabel, errorLabel: this.options.errorLabel})
        }} />);
        return this._container;
    },

    onRemove: function(_map) {
        this._container = null;
    }
})

const LegendWrapperComponent = createControlComponent(
    (props) => {
        return new LegendControlExtends(props);
    }
);

export default function LegendControl(){
    const t = useTranslations('radar');
    const ref = useRef()

    return <LegendWrapperComponent ref={ref} position="topright" legendLabel={t('legend')} errorLabel={t('legendError')} />
}