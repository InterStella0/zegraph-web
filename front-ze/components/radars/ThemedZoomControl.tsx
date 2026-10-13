import {useMap} from "react-leaflet";
import {useEffect} from "react";
import L from "leaflet";
import {createControlContainer, createIcon, onControlClick} from "./leafletControls";

export default function ThemedZoomControl() {
    const map = useMap();

    useEffect(() => {
        const zoomControl = L.Control.extend({
            options: {
                position: 'topleft'
            },

            onAdd: function() {
                const container = createControlContainer();
                const addButton = (title: string, path: string, onClick: () => void) => {
                    const button = L.DomUtil.create('div', '', container);
                    button.title = title;
                    button.style.width = '34px';
                    button.style.height = '34px';
                    button.style.cursor = 'pointer';
                    button.style.display = 'flex';
                    button.style.justifyContent = 'center';
                    button.style.alignItems = 'center';
                    button.style.borderBottom = '1px solid var(--border)';
                    button.appendChild(createIcon(path));
                    onControlClick(button, onClick);
                };
                addButton('Zoom In', 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z', () => map.zoomIn(1));
                addButton('Zoom Out', 'M19 13H5v-2h14v2z', () => map.zoomOut(1));

                return container;
            }
        });

        // Add the control to the map
        const control = new zoomControl();
        map.addControl(control);

        // Cleanup when component unmounts
        return () => {
            map.removeControl(control);
        };
    }, [map]);

    return null;
};