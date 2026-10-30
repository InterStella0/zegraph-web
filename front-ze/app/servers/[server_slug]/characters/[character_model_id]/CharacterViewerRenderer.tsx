'use client'

import { useState } from 'react'
import { Character3DModel } from 'types/maps'
import MapViewer3DWrapper from 'components/maps/MapViewer3DWrapper'
import { AlertTriangle, Box } from 'lucide-react'
import { LoadModelButton, ViewerCard } from './ViewerShell'

export default function CharacterViewerRenderer({ model }: { model: Character3DModel }) {
    const [loaded, setLoaded] = useState(false)

    if (loaded) return <MapViewer3DWrapper modelMetadata={model} />

    return (
        <ViewerCard icon={Box} title={model.name ?? model.model_id}>
            <p className="text-muted-foreground mb-6">
                Load the interactive 3D model to view this character
            </p>
            <LoadModelButton label="Load 3D Model" fileSize={model.file_size} className="w-full" onClick={() => setLoaded(true)} />
            <div className="mt-4 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground text-left">
                    This is a compressed version of the model optimized for web viewing.
                </p>
            </div>
        </ViewerCard>
    )
}
