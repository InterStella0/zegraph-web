import { fetchApiUrl } from './generalUtils';
import { Map3DModel, Character3DModel } from '../types/maps';

export const CHUNK_SIZE = 10 * 1024 * 1024;
export const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024;

export interface UploadProgress {
  totalChunks: number;
  uploadedChunks: number;
  percentage: number;
  currentChunk: number;
  bytesUploaded: number;
  totalBytes: number;
}

export interface ChunkedUploadOptions {
  mapName: string;
  file: File;
  resType: 'low' | 'high';
  credit?: string;
  onProgress?: (progress: UploadProgress) => void;
  onError?: (error: Error, chunkIndex?: number) => void;
  signal?: AbortSignal;
}

export interface CharacterChunkedUploadOptions {
  modelId: string;
  name?: string;
  serverId: string;
  file: File;
  credit?: string;
  onProgress?: (progress: UploadProgress) => void;
  onError?: (error: Error, chunkIndex?: number) => void;
  signal?: AbortSignal;
}

interface InitiateUploadResponse {
  session_id: string;
  chunk_size: number;
  total_chunks: number;
}

interface ChunkUploadResponse {
  chunk_index: number;
  received: boolean;
  chunks_remaining: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function uploadChunkWithRetry(
  basePath: string,
  sessionId: string,
  chunkIndex: number,
  chunkData: Blob,
  maxRetries: number,
  signal: AbortSignal | undefined,
  quiet: boolean
): Promise<ChunkUploadResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Upload cancelled', 'AbortError');
    }

    try {
      const formData = new FormData();
      formData.append('chunk_index', chunkIndex.toString());
      formData.append('chunk_data', chunkData);

      const response = await fetchApiUrl(
        `${basePath}/chunk/${sessionId}`,
        { method: 'POST', body: formData, signal }
      );

      return response as ChunkUploadResponse;
    } catch (error) {
      lastError = error as Error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      if (error instanceof Error && 'status' in error) {
        const status = (error as any).status;
        if (status >= 400 && status < 500) throw error;
      }

      if (attempt < maxRetries - 1) {
        const delay = (attempt + 1) * 1000;
        if (!quiet) {
          console.warn(
            `Chunk ${chunkIndex} upload failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`,
            error
          );
        }
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts`);
}

async function uploadChunked<T>(
  basePath: string,
  initBody: Record<string, unknown>,
  { file, onProgress, onError, signal }: Pick<ChunkedUploadOptions, 'file' | 'onProgress' | 'onError' | 'signal'>,
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
    const initiateResponse = await fetchApiUrl(
      `${basePath}/initiate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...initBody, file_size: file.size, file_name: file.name }),
        signal,
      }
    ) as InitiateUploadResponse;

    const { session_id, total_chunks } = initiateResponse;

    for (let chunkIndex = 0; chunkIndex < total_chunks; chunkIndex++) {
      if (signal?.aborted) {
        await cancelSession(session_id, 'Failed to cancel upload session:');
        throw new DOMException('Upload cancelled', 'AbortError');
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkData = file.slice(start, end);

      try {
        await uploadChunkWithRetry(basePath, session_id, chunkIndex, chunkData, 3, signal, quiet);

        const bytesUploaded = end;
        onProgress?.({
          totalChunks: total_chunks,
          uploadedChunks: chunkIndex + 1,
          percentage: (bytesUploaded / file.size) * 100,
          currentChunk: chunkIndex,
          bytesUploaded,
          totalBytes: file.size,
        });
      } catch (error) {
        const err = error as Error;
        onError?.(err, chunkIndex);
        await cancelSession(session_id, 'Failed to cancel upload session after error:');
        throw err;
      }
    }

    return await fetchApiUrl(
      `${basePath}/complete/${session_id}`,
      { method: 'POST', signal }
    ) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    const err = error as Error;
    onError?.(err);
    throw err;
  }
}

export async function uploadFileChunked(options: ChunkedUploadOptions): Promise<Map3DModel> {
  const { mapName, resType, credit } = options;
  return uploadChunked<Map3DModel>(
    `/maps/${mapName}/3d/upload`,
    { res_type: resType, credit: credit || undefined },
    options,
    false
  );
}

export async function uploadCharacterFileChunked(options: CharacterChunkedUploadOptions): Promise<Character3DModel> {
  const { modelId, name, serverId, credit } = options;
  return uploadChunked<Character3DModel>(
    `/servers/${serverId}/characters/${modelId}/3d/upload`,
    { name: name || undefined, credit: credit || undefined },
    options,
    true
  );
}
