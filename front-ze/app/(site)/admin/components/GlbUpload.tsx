'use client'

import { useState, type ReactNode } from 'react'
import { Button } from 'components/ui/button'
import { Input } from 'components/ui/input'
import { Progress } from 'components/ui/progress'
import { toast } from 'sonner'
import { CHUNKED_UPLOAD_THRESHOLD, UploadProgress } from 'utils/uploadUtils'

type ChunkedOptions = {
  file: File
  credit?: string
  signal: AbortSignal
  onProgress: (progress: UploadProgress) => void
  onError: (error: Error, chunkIndex?: number) => void
}

export function useGlbUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [credit, setCredit] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const reset = (nextCredit: string) => {
    setFile(null)
    setCredit(nextCredit)
    setUploadProgress(null)
    setAbortController(null)
  }

  const submit = async ({ precheck, chunked, direct, successMessage, onSuccess }: {
    precheck?: () => boolean
    chunked: (options: ChunkedOptions) => Promise<unknown>
    direct: (file: File, credit: string) => Promise<unknown>
    successMessage: string
    onSuccess: () => void
  }) => {
    if (precheck && !precheck()) return
    if (!file) {
      toast.error('Please select a file')
      return
    }
    if (!file.name.endsWith('.glb')) {
      toast.error('File must be a .glb file')
      return
    }

    setUploading(true)
    setUploadProgress(null)

    try {
      if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
        const controller = new AbortController()
        setAbortController(controller)
        await chunked({
          file,
          credit: credit.trim() || undefined,
          signal: controller.signal,
          onProgress: (progress) => setUploadProgress(progress),
          onError: (error, chunkIndex) => {
            console.error(`Upload error${chunkIndex !== undefined ? ` at chunk ${chunkIndex}` : ''}:`, error)
          },
        })
      } else {
        await direct(file, credit.trim())
      }

      toast.success(successMessage)
      onSuccess()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.info('Upload cancelled')
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        toast.error(`Failed to upload model: ${errorMessage}`)
      }
    } finally {
      setUploading(false)
      setUploadProgress(null)
      setAbortController(null)
    }
  }

  return { file, setFile, credit, setCredit, uploading, uploadProgress, abortController, reset, submit }
}

export function GlbUploadFields({ upload, fileLabel, replacing, onCancel, onSubmit }: {
  upload: ReturnType<typeof useGlbUpload>
  fileLabel: ReactNode
  replacing: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  const { file, setFile, credit, setCredit, uploading, uploadProgress, abortController } = upload
  return (
    <>
      <div>
        <label className="text-sm font-medium">
          {fileLabel} {replacing && '(will replace existing)'}
        </label>
        <Input
          type="file"
          accept=".glb"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mt-1"
        />
        {file && (
          <p className="text-sm text-muted-foreground mt-1">
            Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium">Credit (Optional)</label>
        <Input
          value={credit}
          onChange={(e) => setCredit(e.target.value)}
          placeholder="Author or source credit"
          className="mt-1"
        />
      </div>

      {uploading && uploadProgress && (
        <div className="space-y-2 p-3 border rounded-md bg-muted/50">
          <div className="flex justify-between text-sm">
            <span>Uploading chunk {uploadProgress.currentChunk + 1} of {uploadProgress.totalChunks}</span>
            <span>{uploadProgress.percentage.toFixed(1)}%</span>
          </div>
          <Progress value={uploadProgress.percentage} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {(uploadProgress.bytesUploaded / (1024 * 1024)).toFixed(1)} MB / {(uploadProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB
            </span>
            <Button variant="ghost" size="sm" onClick={() => abortController?.abort()} className="h-6 px-2">
              Cancel Upload
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={uploading}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={uploading || !file}>
          {uploading ? 'Uploading...' : replacing ? 'Replace' : 'Upload'}
        </Button>
      </div>
    </>
  )
}
