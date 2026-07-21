import {useMap} from "react-leaflet";
import {useEffect} from "react";
import L from "leaflet";
import { useTranslations } from 'next-intl';

export default function HomeButton() {
    const t = useTranslations('radar');
    const map = useMap();

    // Create a custom Leaflet control when the component mounts
    useEffect(() => {
        // Create a custom control
        const resetViewControl = L.Control.extend({
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
                container.style.padding = '0';
                container.style.overflow = 'hidden';

                // Create React root element
                const reactContainer = L.DomUtil.create('div', '', container);
                reactContainer.style.width = '34px';
                reactContainer.style.height = '34px';
                reactContainer.style.cursor = 'pointer';
                reactContainer.title = t('resetView');

                // Use ReactDOM to render the Material UI icon into the container
                try {
                    // Create and render the home icon with inline React
                    const homeIconElement = document.createElement('div');
                    homeIconElement.style.display = 'flex';
                    homeIconElement.style.justifyContent = 'center';
                    homeIconElement.style.alignItems = 'center';
                    homeIconElement.style.width = '100%';
                    homeIconElement.style.height = '100%';
                    reactContainer.appendChild(homeIconElement);

                    // Create SVG home icon using Material UI style
                    const homeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    homeIcon.setAttribute('style', 'width: 20px; height: 20px;');
                    homeIcon.setAttribute('viewBox', '0 0 24 24');
                    homeIcon.setAttribute('fill', 'var(--foreground)');

                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z');
                    homeIcon.appendChild(path);

                    homeIconElement.appendChild(homeIcon);
                } catch (error) {
                    reactContainer.innerHTML = '⌂';
                    reactContainer.style.fontSize = '20px';
                    reactContainer.style.textAlign = 'center';
                    reactContainer.style.lineHeight = '34px';
                }

                // Add event handler
                L.DomEvent
                    .on(reactContainer, 'click', L.DomEvent.preventDefault)
                    .on(reactContainer, 'click', () => {
                        map.setView([0, 0], 2);
                    });

                return container;
            }
        });

        const control = new resetViewControl();
        map.addControl(control);

        return () => {
            map.removeControl(control);
        };
    }, [map, t]);

    return null;
};