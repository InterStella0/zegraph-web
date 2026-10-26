import { fetchApiUrl } from './generalUtils';
import { Map3DModel, Character3DModel } from '../types/maps';

const CHUNK_SIZE = 10 * 1024 * 1024;
const MAX_RETRIES = 3;
export const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024;

export interface UploadProgress {
  totalChunks: number;
  uploadedChunks: number;
  percentage: number;
  currentChunk: number;
  bytesUploaded: number;
  totalBytes: number;
}

interface UploadOptions {
  file: File;
  credit?: string;
  onProgress?: (progress: UploadProgress) => void;
  onError?: (error: Error, chunkIndex?: number) => void;
  signal?: AbortSignal;
}

export interface ChunkedUploadOptions extends UploadOptions {
  mapName: string;
  resType: 'low' | 'high';
}

export interface CharacterChunkedUploadOptions extends UploadOptions {
  modelId: string;
  name?: string;
  serverId: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const cancelled = () => new DOMException('Upload cancelled', 'AbortError');
const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

async function uploadChunkWithRetry(
  basePath: string,
  sessionId: string,
  chunkIndex: number,
  chunkData: Blob,
  signal: AbortSignal | undefined,
  quiet: boolean
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw cancelled();

    try {
      const formData = new FormData();
      formData.append('chunk_index', chunkIndex.toString());
      formData.append('chunk_data', chunkData);
      await fetchApiUrl(`${basePath}/chunk/${sessionId}`, { method: 'POST', body: formData, signal });
      return;
    } catch (error) {
      lastError = error as Error;
      if (isAbort(error)) throw error;
      // Client errors won't succeed on a retry.
      if (error instanceof Error && 'status' in error) {
        const status = (error as any).status;
        if (status >= 400 && status < 500) throw error;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = (attempt + 1) * 1000;
        if (!quiet) {
          console.warn(`Chunk ${chunkIndex} upload failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`, error);
        }
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Failed to upload chunk ${chunkIndex} after ${MAX_RETRIES} attempts`);
}

async function uploadChunked<T>(
  basePath: string,
  initBody: Record<string, unknown>,
  { file, onProgress, onError, signal }: UploadOptions,
  quiet: boolean
): Promise<T> {
  const cancelSession = async (sessionId: string, failureMessage: string) => {
    try {
      await fetchApiUrl(`${basePath}/cancel/${sessionId}`, { method: 'DELETE', signal: undefined });
    } catch (cancelError) {
      if (!quiet) console.error(failureMessage, cancelError);
    }
  };

  try {
    const { session_id, total_chunks }: { session_id: string, total_chunks: number } = await fetchApiUrl(`${basePath}/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...initBody, file_size: file.size, file_name: file.name }),
      signal,
    });

    for (let chunkIndex = 0; chunkIndex < total_chunks; chunkIndex++) {
      if (signal?.aborted) {
        await cancelSession(session_id, 'Failed to cancel upload session:');
        throw cancelled();
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);

      try {
        await uploadChunkWithRetry(basePath, session_id, chunkIndex, file.slice(start, end), signal, quiet);
        onProgress?.({
          totalChunks: total_chunks,
          uploadedChunks: chunkIndex + 1,
          percentage: (end / file.size) * 100,
          currentChunk: chunkIndex,
          bytesUploaded: end,
          totalBytes: file.size,
        });
      } catch (error) {
        onError?.(error, chunkIndex);
        await cancelSession(session_id, 'Failed to cancel upload session after error:');
        throw error;
      }
    }

    return await fetchApiUrl(`${basePath}/complete/${session_id}`, { method: 'POST', signal });
  } catch (error) {
    if (!isAbort(error)) onError?.(error);
    throw error;
  }
}

export function uploadFileChunked(options: ChunkedUploadOptions): Promise<Map3DModel> {
  const { mapName, resType, credit } = options;
  return uploadChunked(`/maps/${mapName}/3d/upload`, { res_type: resType, credit: credit || undefined }, options, false);
}

export function uploadCharacterFileChunked(options: CharacterChunkedUploadOptions): Promise<Character3DModel> {
  const { modelId, name, serverId, credit } = options;
  return uploadChunked(
    `/servers/${serverId}/characters/${modelId}/3d/upload`,
    { name: name || undefined, credit: credit || undefined },
    options,
    true
  );
}
