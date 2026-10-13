import {useMap} from "react-leaflet";
import {useEffect} from "react";
import L from "leaflet";

export default function ThemedZoomControl() {
    const map = useMap();

    useEffect(() => {
        const zoomControl = L.Control.extend({
            options: {
                position: 'topleft'
            },

            onAdd: function() {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);
                L.DomEvent.on(container, 'wheel', L.DomEvent.stopPropagation);
                L.DomEvent.on(container, 'dblclick', L.DomEvent.stopPropagation);
                L.DomEvent.on(container, 'mousedown', L.DomEvent.stopPropagation);
                L.DomEvent.on(container, 'touchstart', L.DomEvent.stopPropagation);
                L.DomEvent.on(container, 'pointerdown', L.DomEvent.stopPropagation);
                L.DomEvent.on(container, 'contextmenu', L.DomEvent.stopPropagation);
                container.style.backgroundColor = 'var(--background)';

                const zoomInButton = L.DomUtil.create('div', '', container);
                zoomInButton.title = 'Zoom In';
                zoomInButton.style.width = '34px';
                zoomInButton.style.height = '34px';
                zoomInButton.style.cursor = 'pointer';
                zoomInButton.style.display = 'flex';
                zoomInButton.style.justifyContent = 'center';
                zoomInButton.style.alignItems = 'center';
                zoomInButton.style.borderBottom = '1px solid var(--border)';

                const zoomInIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                zoomInIcon.setAttribute('style', 'width: 20px; height: 20px;');
                zoomInIcon.setAttribute('viewBox', '0 0 24 24');
                zoomInIcon.setAttribute('fill', 'var(--foreground)');

                const zoomInPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                zoomInPath.setAttribute('d', 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z');
                zoomInIcon.appendChild(zoomInPath);
                zoomInButton.appendChild(zoomInIcon);

                const zoomOutButton = L.DomUtil.create('div', '', container);
                zoomOutButton.title = 'Zoom Out';
                zoomOutButton.style.width = '34px';
                zoomOutButton.style.height = '34px';
                zoomOutButton.style.cursor = 'pointer';
                zoomOutButton.style.display = 'flex';
                zoomOutButton.style.justifyContent = 'center';
                zoomOutButton.style.alignItems = 'center';
                zoomOutButton.style.borderBottom = '1px solid var(--border)';

                const zoomOutIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                zoomOutIcon.setAttribute('style', 'width: 20px; height: 20px;');
                zoomOutIcon.setAttribute('viewBox', '0 0 24 24');
                zoomOutIcon.setAttribute('fill', 'var(--foreground)');

                const zoomOutPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                zoomOutPath.setAttribute('d', 'M19 13H5v-2h14v2z');
                zoomOutIcon.appendChild(zoomOutPath);
                zoomOutButton.appendChild(zoomOutIcon);

                // Add event handlers
                L.DomEvent
                    .on(zoomInButton, 'click', L.DomEvent.preventDefault)
                    .on(zoomInButton, 'click', () => {
                        map.zoomIn(1);
                    });

                L.DomEvent
                    .on(zoomOutButton, 'click', L.DomEvent.preventDefault)
                    .on(zoomOutButton, 'click', () => {
                        map.zoomOut(1);
                    });

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