'use client'

import { useState } from 'react'
import { Character3DModel, Map3DModel } from 'types/maps'
import MapViewer3DWrapper from 'components/maps/MapViewer3DWrapper'
import { Button } from 'components/ui/button'
import { Card } from 'components/ui/card'
import { AlertTriangle, Box } from 'lucide-react'

function toMap3DModel(model: Character3DModel): Map3DModel {
    return {
        id: model.id,
        map_name: model.model_id,
        res_type: 'high',
        credit: model.credit,
        link_path: model.link_path,
        uploaded_by: model.uploaded_by,
        uploader_name: model.uploader_name,
        file_size: model.file_size,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
}

export default function CharacterViewerRenderer({ model }: { model: Character3DModel }) {
    const [loaded, setLoaded] = useState(false)

    if (!loaded) {
        return (
            <Card className="max-w-md p-8 text-center">
                <Box className="w-16 h-16 mx-auto mb-4 text-primary" />
                <h2 className="text-2xl font-bold mb-2">{model.name ?? model.model_id}</h2>
                <p className="text-muted-foreground mb-6">
                    Load the interactive 3D model to view this character
                </p>
                <Button
                    size="lg"
                    className="flex-col h-auto py-3 w-full"
                    onClick={() => setLoaded(true)}
                >
                    <span>Load 3D Model</span>
                    <span className="text-xs opacity-70">{formatFileSize(model.file_size)}</span>
                </Button>
                <div className="mt-4 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground text-left">
                        This is a compressed version of the model optimized for web viewing.
                    </p>
                </div>
            </Card>
        )
    }

    return (
        <MapViewer3DWrapper
            mapName={model.model_id}
            resType="high"
            modelMetadata={toMap3DModel(model)}
        />
    )
}
