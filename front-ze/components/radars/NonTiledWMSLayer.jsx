'use client'
import L from "leaflet";
import { createLayerComponent } from "@react-leaflet/core";
import 'leaflet.nontiledlayer';

function createNonTiledWMS({ url, layers, ...options }, context) {
    const layer = L.nonTiledLayer.wms(url, { layers, ...options });
    return { instance: layer, context };
}

function updateNonTiledWMS(layer, props, prevProps) {
    if (props.opacity !== prevProps.opacity) {
        layer.setOpacity(props.opacity);
    }
}

const NonTiledWMSLayer = createLayerComponent(
    createNonTiledWMS, updateNonTiledWMS
);

export default NonTiledWMSLayer;
