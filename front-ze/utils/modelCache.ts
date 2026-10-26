interface ModelCache {
  version: number
  modelUrl: string
  timestamp: number
  objectsToRemove: number[]
  meshCount: number
  dracoMeshCount: number
}

const CACHE_VERSION = 3
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const cacheKey = (url: string) => `model_cache_v${CACHE_VERSION}_${url}`

export async function getCachedModelData(url: string): Promise<ModelCache | null> {
  try {
    const cached = localStorage.getItem(cacheKey(url))
    const data: ModelCache | null = cached ? JSON.parse(cached) : null
    if (data && Date.now() - data.timestamp < CACHE_TTL && data.version === CACHE_VERSION) return data
  } catch (e) {
    console.warn('Failed to load model cache:', e)
  }
  return null
}

export async function cacheModelData(url: string, data: Omit<ModelCache, 'version' | 'timestamp'>): Promise<void> {
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify({ ...data, version: CACHE_VERSION, timestamp: Date.now() }))
  } catch (e) {
    console.warn('Failed to cache model data:', e)
  }
}
