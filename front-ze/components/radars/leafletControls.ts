import L from "leaflet";

export function isolateEvents(container: HTMLElement) {
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    for (const event of ['wheel', 'dblclick', 'mousedown', 'touchstart', 'pointerdown', 'contextmenu']) {
        L.DomEvent.on(container, event, L.DomEvent.stopPropagation);
    }
}

export function createControlContainer(): HTMLElement {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    isolateEvents(container);
    container.style.backgroundColor = 'var(--background)';
    return container;
}

export function createIcon(path: string): SVGSVGElement {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('style', 'width: 20px; height: 20px;');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'var(--foreground)');
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', path);
    icon.appendChild(iconPath);
    return icon;
}

export function onControlClick(element: HTMLElement, handler: () => void) {
    L.DomEvent
        .on(element, 'click', L.DomEvent.preventDefault)
        .on(element, 'click', handler);
}
