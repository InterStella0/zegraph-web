import { Object3D } from 'three'

/** Visits every object of the scene, yielding to the event loop between chunks so big scenes don't freeze the page. */
export async function traverseSceneChunked(
  scene: Object3D,
  callback: (obj: Object3D) => void | Promise<void>,
  { chunkSize = 150, onProgress }: { chunkSize?: number, onProgress?: (percent: number) => void } = {}
): Promise<void> {
  const objects: Object3D[] = []
  scene.traverse(obj => objects.push(obj))

  for (let i = 0; i < objects.length; i += chunkSize) {
    const chunk = objects.slice(i, i + chunkSize)
    for (const obj of chunk) await callback(obj)
    onProgress?.(((i + chunk.length) / objects.length) * 100)
    if (i + chunkSize < objects.length) await new Promise(resolve => setTimeout(resolve, 0))
  }
}
