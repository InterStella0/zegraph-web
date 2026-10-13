import {useEffect, useRef, useState} from 'react';
import { useMap } from 'react-leaflet';
import ReactDOM from 'react-dom/client';
import L from 'leaflet'
import { Alert, AlertDescription } from 'components/ui/alert';
import { Button } from 'components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/ui/tooltip';
import { Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {isolateEvents} from "./leafletControls";


function RenderedInfoMessage({ message, showInfoLabel }){
    const [isExpanded, setIsExpanded] = useState(() => {
        const savedState = localStorage.getItem(`infoMessage`);
        return savedState !== "collapsed";
    })
    return (
        <TooltipProvider>
            {isExpanded ? (
                <div className="rounded overflow-hidden shadow-md">
                    <Alert className="w-[280px] card-solid">
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-sm pr-8">
                            {message}
                        </AlertDescription>
                        <Button
                            variant="outline"
                            size="icon"
                            className="absolute top-2 right-2 h-6 w-6"
                            onClick={(e) => {
                                e.stopPropagation()
                                setIsExpanded(false);
                                localStorage.setItem(`infoMessage`, "collapsed");
                            }}
                        >
                            <X className="h-4 w-4 text-primary" />
                        </Button>
                    </Alert>
                </div>
            ) : (
                <div className="m-1 rounded-full shadow-md overflow-hidden w-auto">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="m-0.5 h-8 w-8 rounded-full bg-background hover:bg-accent"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsExpanded(true);
                                    localStorage.setItem(`infoMessage`, "expanded");
                                }}
                            >
                                <Info className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{showInfoLabel}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            )}
        </TooltipProvider>
    )
}

const InfoControl = L.Control.extend({
    options: {
        position: 'topleft'
    },
    initialize: function(message, showInfoLabel, options) {
        this.message = message;
        this.showInfoLabel = showInfoLabel;
        L.setOptions(this, options);
        this._reactRoot = null
    },
    updateMessage: function(message){
        if (this._reactRoot)
            this._reactRoot.render(<RenderedInfoMessage key={Date.now()} message={message} showInfoLabel={this.showInfoLabel} />)
    },
    onAdd: function () {
        const container = L.DomUtil.create('div');
        isolateEvents(container);
        this._reactRoot = ReactDOM.createRoot(container);
        this._reactRoot.render(<RenderedInfoMessage message={this.message} showInfoLabel={this.showInfoLabel} />)
        return container;
    }
});
export default function InfoMessage({ message }: { message?: string}) {
    const t = useTranslations('radar');
    const resolvedMessage = message ?? t('infoDefault');
    const map = useMap();
    const controlRef = useRef(null)

    useEffect(() => {
        if (!map) return

        const control = new InfoControl(resolvedMessage, t('showInfo'));
        map.addControl(control);
        controlRef.current = control

        return () => {
            if (!map) return

            map.removeControl(control);
        };
    }, [map, resolvedMessage, t])

    useEffect(() => {
        if (!controlRef.current) return

        controlRef.current.updateMessage(resolvedMessage)
    }, [controlRef, resolvedMessage])

    return null;
}
