import { fetchApiUrl } from './generalUtils';
import { Map3DModel, Character3DModel } from '../types/maps';

export const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
export const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024; // 50MB

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
  mapName: string,
  sessionId: string,
  chunkIndex: number,
  chunkData: Blob,
  maxRetries: number = 3,
  signal?: AbortSignal
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
        `/maps/${mapName}/3d/upload/chunk/${sessionId}`,
        {
          method: 'POST',
          body: formData,
          signal,
        }
      );

      return response as ChunkUploadResponse;
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      // Don't retry on client errors (400-499)
      if (error instanceof Error && 'status' in error) {
        const status = (error as any).status;
        if (status >= 400 && status < 500) {
          throw error;
        }
      }

      // Exponential backoff: 1s, 2s, 3s
      if (attempt < maxRetries - 1) {
        const delay = (attempt + 1) * 1000;
        console.warn(
          `Chunk ${chunkIndex} upload failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`,
          error
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts`);
}

export async function uploadFileChunked(
  options: ChunkedUploadOptions
): Promise<Map3DModel> {
  const { mapName, file, resType, credit, onProgress, onError, signal } = options;

  try {
    // Step 1: Initiate upload session
    const initiateResponse = await fetchApiUrl(
      `/maps/${mapName}/3d/upload/initiate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          res_type: resType,
          credit: credit || undefined,
          file_size: file.size,
          file_name: file.name,
        }),
        signal,
      }
    ) as InitiateUploadResponse;

    const { session_id, total_chunks } = initiateResponse;

    // Step 2: Upload chunks sequentially
    for (let chunkIndex = 0; chunkIndex < total_chunks; chunkIndex++) {
      if (signal?.aborted) {
        // Cancel the upload session
        try {
          await fetchApiUrl(
            `/maps/${mapName}/3d/upload/cancel/${session_id}`,
            {
              method: 'DELETE',
              signal: undefined, // Don't pass abort signal to cancel request
            }
          );
        } catch (cancelError) {
          console.error('Failed to cancel upload session:', cancelError);
        }
        throw new DOMException('Upload cancelled', 'AbortError');
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkData = file.slice(start, end);

      try {
        await uploadChunkWithRetry(
          mapName,
          session_id,
          chunkIndex,
          chunkData,
          3,
          signal
        );

        // Update progress
        const bytesUploaded = end;
        const progress: UploadProgress = {
          totalChunks: total_chunks,
          uploadedChunks: chunkIndex + 1,
          percentage: (bytesUploaded / file.size) * 100,
          currentChunk: chunkIndex,
          bytesUploaded,
          totalBytes: file.size,
        };

        onProgress?.(progress);
      } catch (error) {
        const err = error as Error;
        onError?.(err, chunkIndex);

        // Try to cancel the session on error
        try {
          await fetchApiUrl(
            `/maps/${mapName}/3d/upload/cancel/${session_id}`,
            {
              method: 'DELETE',
              signal: undefined,
            }
          );
        } catch (cancelError) {
          console.error('Failed to cancel upload session after error:', cancelError);
        }

        throw err;
      }
    }

    // Step 3: Complete upload
    const result = await fetchApiUrl(
      `/maps/${mapName}/3d/upload/complete/${session_id}`,
      {
        method: 'POST',
        signal,
      }
    ) as Map3DModel;

    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    const err = error as Error;
    onError?.(err);
    throw err;
  }
}

async function uploadCharacterChunkWithRetry(
  serverId: string,
  modelId: string,
  sessionId: string,
  chunkIndex: number,
  chunkData: Blob,
  maxRetries: number = 3,
  signal?: AbortSignal
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
        `/servers/${serverId}/characters/${modelId}/3d/upload/chunk/${sessionId}`,
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
        await sleep((attempt + 1) * 1000);
      }
    }
  }

  throw lastError || new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts`);
}

export async function uploadCharacterFileChunked(
  options: CharacterChunkedUploadOptions
): Promise<Character3DModel> {
  const { modelId, name, serverId, file, credit, onProgress, onError, signal } = options;

  try {
    const initiateResponse = await fetchApiUrl(
      `/servers/${serverId}/characters/${modelId}/3d/upload/initiate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || undefined, credit: credit || undefined, file_size: file.size, file_name: file.name }),
        signal,
      }
    ) as InitiateUploadResponse;

    const { session_id, total_chunks } = initiateResponse;

    for (let chunkIndex = 0; chunkIndex < total_chunks; chunkIndex++) {
      if (signal?.aborted) {
        try {
          await fetchApiUrl(`/servers/${serverId}/characters/${modelId}/3d/upload/cancel/${session_id}`, { method: 'DELETE' });
        } catch {}
        throw new DOMException('Upload cancelled', 'AbortError');
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkData = file.slice(start, end);

      try {
        await uploadCharacterChunkWithRetry(serverId, modelId, session_id, chunkIndex, chunkData, 3, signal);

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
        try {
          await fetchApiUrl(`/servers/${serverId}/characters/${modelId}/3d/upload/cancel/${session_id}`, { method: 'DELETE' });
        } catch {}
        throw err;
      }
    }

    const result = await fetchApiUrl(
      `/servers/${serverId}/characters/${modelId}/3d/upload/complete/${session_id}`,
      { method: 'POST', signal }
    ) as Character3DModel;

    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    const err = error as Error;
    onError?.(err);
    throw err;
  }
}
