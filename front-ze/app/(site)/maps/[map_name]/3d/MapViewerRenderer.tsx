'use client'
import { useState } from 'react'
import MapViewer3DWrapper from 'components/maps/MapViewer3DWrapper'
import { AlertTriangle, Boxes } from 'lucide-react'
import { MapWithModels } from 'types/maps'
import { LoadModelButton, ViewerCard } from './ViewerShell'

export default function MapViewerRenderer({ map_name, modelMetadata, error }: {
  map_name: string,
  modelMetadata: MapWithModels | null,
  error: string | null,
}) {
  const [selectedRes, setSelectedRes] = useState<'high' | 'low' | null>(null)
  const high = modelMetadata?.high_res_model
  const low = modelMetadata?.low_res_model

  if (error || (!high && !low)) {
    return (
      <ViewerCard icon={AlertTriangle} iconClassName="text-destructive" title="No 3D Models Available">
        <p className="text-muted-foreground mb-4">
          {error || 'There are no 3D models available for this map yet.'}
        </p>
      </ViewerCard>
    )
  }

  const currentModel = selectedRes === 'high' ? high : low
  if (selectedRes && currentModel) return <MapViewer3DWrapper modelMetadata={currentModel} />

  return (
    <ViewerCard icon={Boxes} title={map_name}>
      <p className="text-muted-foreground mb-6">
        Load the interactive 3D model to explore this map with FPS controls
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center mb-4">
        <LoadModelButton label="High Resolution" fileSize={high?.file_size} onClick={() => setSelectedRes('high')} disabled={!high} />
        <LoadModelButton label="Low Resolution" fileSize={low?.file_size} variant="secondary" onClick={() => setSelectedRes('low')} disabled={!low} />
      </div>
      <div className="mt-4 space-y-1">
        <div className="flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2 text-muted-foreground" />
          <p className="text-xs text-muted-foreground text-left">
            This is a compressed version of the map optimized for web viewing. It may take awhile to download.
          </p>
        </div>
      </div>
    </ViewerCard>
  )
}
