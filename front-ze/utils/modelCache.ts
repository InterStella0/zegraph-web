interface ModelCache {
  version: number
  modelUrl: string
  timestamp: number
  objectsToRemove: number[]
  meshCount: number
  dracoMeshCount: number
}

const CACHE_VERSION = 3
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function getCachedModelData(url: string): Promise<ModelCache | null> {
  try {
    const key = `model_cache_v${CACHE_VERSION}_${url}`
    const cached = localStorage.getItem(key)

    if (cached) {
      const data = JSON.parse(cached) as ModelCache

      if (Date.now() - data.timestamp < CACHE_TTL && data.version === CACHE_VERSION) {
        return data
      }
    }
  } catch (e) {
    console.warn('Failed to load model cache:', e)
  }
  return null
}

export async function cacheModelData(url: string, data: Omit<ModelCache, 'version' | 'timestamp'>): Promise<void> {
  try {
    const key = `model_cache_v${CACHE_VERSION}_${url}`
    const cacheData: ModelCache = {
      ...data,
      version: CACHE_VERSION,
      timestamp: Date.now()
    }
    localStorage.setItem(key, JSON.stringify(cacheData))
  } catch (e) {
    console.warn('Failed to cache model data:', e)
  }
}

export function clearModelCache(): void {
  try {
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith('model_cache_')) {
        localStorage.removeItem(key)
      }
    })
  } catch (e) {
    console.warn('Failed to clear model cache:', e)
  }
}
