'use client'

import { useState, type ReactNode } from 'react'
import { Button } from 'components/ui/button'
import { Input } from 'components/ui/input'
import { Progress } from 'components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/ui/dialog'
import { toast } from 'sonner'
import { fetchApiUrl } from 'utils/generalUtils'
import { formatFileSize } from 'utils/format'
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

  /** Files over the chunk threshold go through `chunked`; smaller ones are posted as a form with `fields`. */
  const submit = async ({ precheck, chunked, endpoint, fields = {}, successMessage, onSuccess }: {
    precheck?: () => boolean
    chunked: (options: ChunkedOptions) => Promise<unknown>
    endpoint: string
    fields?: Record<string, string | undefined>
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
          onProgress: setUploadProgress,
          onError: (error, chunkIndex) => {
            console.error(`Upload error${chunkIndex !== undefined ? ` at chunk ${chunkIndex}` : ''}:`, error)
          },
        })
      } else {
        const formData = new FormData()
        formData.append('file', file)
        for (const [key, value] of Object.entries({ ...fields, credit: credit.trim() })) {
          if (value) formData.append(key, value)
        }
        await fetchApiUrl(endpoint, { method: 'POST', body: formData })
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

export function CurrentModelInfo({ title, model, action }: {
  title: string
  model: { file_size: number; credit?: string | null }
  action?: ReactNode
}) {
  return (
    <div className="p-3 border rounded-md bg-muted/50 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatFileSize(model.file_size)}
          {model.credit && ` • ${model.credit}`}
        </p>
      </div>
      {action}
    </div>
  )
}

export function GlbUploadDialog({
  open, onOpenChange, title, titleClassName, children, upload, fileLabel, replacing, onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  titleClassName?: string
  children: ReactNode
  upload: ReturnType<typeof useGlbUpload>
  fileLabel: ReactNode
  replacing: boolean
  onSubmit: () => void
}) {
  const { file, setFile, credit, setCredit, uploading, uploadProgress, abortController } = upload
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className={titleClassName}>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {children}

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
                Selected: {file.name} ({formatFileSize(file.size)})
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
                  {formatFileSize(uploadProgress.bytesUploaded)} / {formatFileSize(uploadProgress.totalBytes)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => abortController?.abort()} className="h-6 px-2">
                  Cancel Upload
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={uploading || !file}>
              {uploading ? 'Uploading...' : replacing ? 'Replace' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
