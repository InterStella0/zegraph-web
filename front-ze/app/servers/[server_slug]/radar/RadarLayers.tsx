'use client'
import dynamic from "next/dynamic";
const Radar = dynamic(() => import("./Radar"), {
    ssr: false,
});

export default function RadarLayers() {
    return <Radar />
}