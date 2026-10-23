'use client'
import L from "leaflet";
import { createLayerComponent } from "@react-leaflet/core";
import 'leaflet.nontiledlayer';

function createNonTiledWMS({ url, ...options }, context) {
    return { instance: L.nonTiledLayer.wms(url, options), context };
}

function updateNonTiledWMS(layer, props, prevProps) {
    if (props.opacity !== prevProps.opacity) {
        layer.setOpacity(props.opacity);
    }
}

export default createLayerComponent(createNonTiledWMS, updateNonTiledWMS);
