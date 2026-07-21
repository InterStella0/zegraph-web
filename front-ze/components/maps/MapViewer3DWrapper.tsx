'use client'
import dynamic from 'next/dynamic'
import { Map3DModel } from 'types/maps'

const MapViewer3D = dynamic(() => import('./MapViewer3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-lg font-medium">Loading 3D viewer...</div>
        <div className="text-sm text-muted-foreground mt-2">
          Initializing Three.js renderer
        </div>
      </div>
    </div>
  )
})

export default function MapViewer3DWrapper({
  mapName,
  resType,
  modelMetadata
}: {
  mapName: string
  resType: 'high' | 'low'
  modelMetadata: Map3DModel
}) {
  return <MapViewer3D mapName={mapName} resType={resType} modelMetadata={modelMetadata} />
}
