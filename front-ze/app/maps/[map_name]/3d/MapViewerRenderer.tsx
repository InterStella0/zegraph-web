'use client'
import { useEffect, useState } from 'react'
import MapViewer3DWrapper from 'components/maps/MapViewer3DWrapper'
import { Button } from 'components/ui/button'
import { AlertTriangle, Boxes } from 'lucide-react'
import { Card } from 'components/ui/card'
import { fetchApiUrl } from 'utils/generalUtils'
import { MapWithModels } from 'types/maps'
import { Skeleton } from 'components/ui/skeleton'

const formatFileSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export default function MapViewerRenderer({ map_name }: { map_name: string }) {
  const [modelMetadata, setModelMetadata] = useState<MapWithModels | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRes, setSelectedRes] = useState<'high' | 'low' | null>(null)

  // Fetch model metadata on mount
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setIsLoading(true)
        const data: MapWithModels = await fetchApiUrl(`/maps/${map_name}/3d`)
        setModelMetadata(data)
      } catch (err) {
        console.error('Failed to fetch model metadata:', err)
        setError(err instanceof Error ? err.message : 'Failed to load model metadata')
      } finally {
        setIsLoading(false)
      }
    }

    fetchMetadata().catch(e => console.error(e))
  }, [map_name])

  const handleResolutionClick = (res: 'high' | 'low') => {
    setSelectedRes(res)
  }

  if (isLoading) {
    return (
      <Card className="max-w-md p-8 text-center">
        <Skeleton className="w-16 h-16 mx-auto mb-4 rounded-lg" />
        <Skeleton className="h-8 w-48 mx-auto mb-4" />
        <Skeleton className="h-4 w-full mb-6" />
        <div className="flex gap-2 justify-center">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
      </Card>
    )
  }

  // Error state or no models available
  if (error || !modelMetadata || (!modelMetadata.high_res_model && !modelMetadata.low_res_model)) {
    return (
      <Card className="max-w-md p-8 text-center">
        <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-destructive" />
        <h2 className="text-2xl font-bold mb-2">No 3D Models Available</h2>
        <p className="text-muted-foreground mb-4">
          {error || 'There are no 3D models available for this map yet.'}
        </p>
      </Card>
    )
  }

  const currentModel = selectedRes === 'high' ? modelMetadata.high_res_model : modelMetadata.low_res_model

  // Show selection screen if no resolution selected yet
  if (!selectedRes || !currentModel) {
    return (
      <Card className="max-w-md p-8 text-center">
        <Boxes className="w-16 h-16 mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2">{map_name}</h2>
        <p className="text-muted-foreground mb-6">
          Load the interactive 3D model to explore this map with FPS controls
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center mb-4">
          <Button
            size="lg"
            className="flex-col h-auto py-3"
            onClick={() => handleResolutionClick('high')}
            disabled={!modelMetadata.high_res_model}
          >
            <span>High Resolution</span>
            {modelMetadata.high_res_model && (
              <span className="text-xs opacity-70">
                {formatFileSize(modelMetadata.high_res_model.file_size)}
              </span>
            )}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="flex-col h-auto py-3"
            onClick={() => handleResolutionClick('low')}
            disabled={!modelMetadata.low_res_model}
          >
            <span>Low Resolution</span>
            {modelMetadata.low_res_model && (
              <span className="text-xs opacity-70">
                {formatFileSize(modelMetadata.low_res_model.file_size)}
              </span>
            )}
          </Button>
        </div>
        <div className="mt-4 space-y-1">
          <div className="flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-left">
              This is a compressed version of the map optimized for web viewing. It may take awhile to download.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <MapViewer3DWrapper
      mapName={map_name}
      resType={selectedRes}
      modelMetadata={currentModel}
    />
  )
}