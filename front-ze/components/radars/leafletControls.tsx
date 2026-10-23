import L, {type ControlPosition} from "leaflet";
import {type ReactNode, useEffect, useRef} from "react";
import {createRoot, type Root} from "react-dom/client";
import {useMap} from "react-leaflet";
import {NextIntlClientProvider, useLocale, useMessages, useTimeZone, useTranslations} from "next-intl";
import {cn} from "components/lib/utils";

function isolateEvents(container: HTMLElement) {
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    for (const event of ['wheel', 'dblclick', 'mousedown', 'touchstart', 'pointerdown', 'contextmenu']) {
        L.DomEvent.on(container, event, L.DomEvent.stopPropagation);
    }
}

/**
 * Renders `element` inside a Leaflet control. The control stops event propagation so the map ignores clicks and
 * drags on it, which would also hide those events from the page's React root, so it gets a React root of its own.
 * Context does not cross roots: intl is re-provided here, anything else has to come in through props.
 */
export function useReactControl(element: ReactNode, position: ControlPosition, className = '') {
    const map = useMap();
    const locale = useLocale();
    const messages = useMessages();
    const timeZone = useTimeZone();
    const root = useRef<Root>(null);

    useEffect(() => {
        const control = new L.Control({position});
        control.onAdd = () => {
            const container = L.DomUtil.create('div', className);
            isolateEvents(container);
            root.current = createRoot(container);
            return container;
        };
        control.addTo(map);
        const controlRoot = root.current;
        return () => {
            control.remove();
            // React refuses to unmount a root synchronously while it is still committing this one.
            setTimeout(() => controlRoot.unmount());
        };
    }, [map, position, className]);

    useEffect(() => {
        root.current.render(
            <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
                {element}
            </NextIntlClientProvider>
        );
    });
}

function ControlButton({ title, path, onClick, className }: { title: string, path: string, onClick: () => void, className?: string }) {
    return (
        <div title={title} onClick={onClick} className={cn("w-[34px] h-[34px] cursor-pointer flex justify-center items-center", className)}>
            <svg style={{width: 20, height: 20}} viewBox="0 0 24 24" fill="var(--foreground)">
                <path d={path} />
            </svg>
        </div>
    );
}

export function ThemedZoomControl() {
    const map = useMap();
    useReactControl(<>
        <ControlButton title="Zoom In" path="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" onClick={() => map.zoomIn(1)} className="border-b border-border" />
        <ControlButton title="Zoom Out" path="M19 13H5v-2h14v2z" onClick={() => map.zoomOut(1)} className="border-b border-border" />
    </>, 'topleft', 'leaflet-bar bg-background');
    return null;
}

export function HomeButton() {
    const t = useTranslations('radar');
    const map = useMap();
    useReactControl(
        <ControlButton title={t('resetView')} path="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" onClick={() => map.setView([0, 0], 2)} />,
        'topleft', 'leaflet-bar bg-background overflow-hidden',
    );
    return null;
}
