import { Object3D } from 'three'

export interface ProcessingOptions {
  chunkSize?: number
  onProgress?: (percent: number) => void
  yieldInterval?: number
}

export async function traverseSceneChunked(
  scene: Object3D,
  callback: (obj: Object3D) => void | Promise<void>,
  options: ProcessingOptions = {}
): Promise<void> {
  const { chunkSize = 150, onProgress, yieldInterval = 0 } = options

  const objects: Object3D[] = []
  scene.traverse(obj => objects.push(obj))

  const total = objects.length
  let processed = 0

  for (let i = 0; i < total; i += chunkSize) {
    const chunk = objects.slice(i, Math.min(i + chunkSize, total))

    for (const obj of chunk) {
      await callback(obj)
    }

    processed += chunk.length

    if (onProgress) {
      onProgress((processed / total) * 100)
    }

    if (i + chunkSize < total) {
      await new Promise(resolve => setTimeout(resolve, yieldInterval))
    }
  }
}

// Falls back to synchronous traversal if chunking fails.
export async function traverseSceneSafe(
  scene: Object3D,
  callback: (obj: Object3D) => void
): Promise<void> {
  try {
    await traverseSceneChunked(scene, callback)
  } catch (error) {
    console.warn('Chunked processing failed, falling back to sync:', error)
    scene.traverse(callback)
  }
}
