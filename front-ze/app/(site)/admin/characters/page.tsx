"use client"

import { useState, useEffect, useCallback } from 'react'
import { TableCell, TableRow } from 'components/ui/table'
import { Button } from 'components/ui/button'
import { Input } from 'components/ui/input'
import { Badge } from 'components/ui/badge'
import { SearchField } from 'components/ui/SearchField'
import { toast } from 'sonner'
import { Upload, Trash2, Image } from 'lucide-react'
import {fetchApiUrl, fetchUrl} from 'utils/generalUtils'
import { uploadCharacterFileChunked } from 'utils/uploadUtils'
import { CurrentModelInfo, GlbUploadDialog, useGlbUpload } from '../components/GlbUpload'
import { formatFileSize } from 'utils/format'
import { AdminHeader, AdminTable, OptionSelect, postForm, runAction, useDialogTarget } from '../components/AdminUI'
import { Character3DModel } from 'types/maps'
import {getCommunity} from "app/getCommunity.ts";
import {Community} from "types/community.ts";

const HEADERS = ['Thumbnail', 'Name', 'Model ID', 'File Size', 'Credit', 'Uploaded By', 'Actions']

export default function AdminCharactersPage() {
  const [models, setModels] = useState<Character3DModel[]>([])
  const [loading, setLoading] = useState(false)
  const [servers, setServers] = useState<[string, string][]>([])
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  // An item replaces that model; null uploads a new one.
  const uploadDialog = useDialogTarget<Character3DModel>()

  useEffect(() => {
    getCommunity().then((data: Community[]) => {
      const serverList = data.flatMap((community) =>
        community.servers.map((server): [string, string] => [server.id, `${community.name} — ${server.name}`]))
      setServers(serverList)
      if (serverList.length > 0) {
        setSelectedServerId(serverList[0][0])
      }
    }).catch(() => toast.error('Failed to load servers'))
  }, [])

  const fetchModels = useCallback(async () => {
    if (!selectedServerId) return
    setLoading(true)
    try {
      setModels(await fetchUrl(`/servers/${selectedServerId}/characters`))
    } catch {
      toast.error('Failed to load character models')
    } finally {
      setLoading(false)
    }
  }, [selectedServerId])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const handleDelete = (model: Character3DModel) => runAction(
    () => fetchApiUrl(`/servers/${selectedServerId}/characters/${model.model_id}/3d`, { method: 'DELETE' }),
    fetchModels,
    { confirm: `Delete 3D model "${model.name ?? model.model_id}"?`, success: 'Model deleted', failure: 'Failed to delete model' },
  )

  const handleThumbnailUpload = (model: Character3DModel, file: File) => {
    const formData = new FormData()
    formData.append('thumbnail', file)
    return runAction(async () => {
      const updated = await postForm<Character3DModel>(`/servers/${selectedServerId}/characters/${model.model_id}/3d/thumbnail`, formData)
      setModels(prev => prev.map(m => m.id === updated.id ? updated : m))
    }, () => {}, { success: 'Thumbnail uploaded', failure: 'Failed to upload thumbnail' })
  }

  const query = searchTerm.toLowerCase()
  const filteredModels = models.filter(m =>
    (m.name ?? m.model_id).toLowerCase().includes(query) || m.model_id.toLowerCase().includes(query)
  )

  return (
    <div className="p-6">
      <AdminHeader
        className="mb-6"
        title="Character 3D Model Management"
        description="Upload and manage 3D models (.glb files) for characters"
      />

      <div className="mb-4">
        <OptionSelect
          value={selectedServerId}
          onChange={setSelectedServerId}
          options={servers}
          placeholder="Select a server"
          className="w-[320px]"
        />
      </div>

      {!selectedServerId ? (
        <p className="text-muted-foreground">Please select a server to manage character models.</p>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <SearchField
              className="flex-1"
              placeholder="Search characters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Button onClick={() => uploadDialog.show(null)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload New
            </Button>
          </div>

          <div className="border rounded-lg">
            <AdminTable
              headers={HEADERS}
              rows={loading ? [] : filteredModels}
              empty={loading ? 'Loading...' : 'No character models found'}
              emptyClassName="text-center"
            >
              {(model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    {model.thumbnail_path ? (
                      <img
                        src={model.thumbnail_path}
                        alt="thumbnail"
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                        <Image className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{model.name ?? '—'}</TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">{model.model_id}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{formatFileSize(model.file_size)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {model.credit ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {model.uploader_name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => uploadDialog.show(model)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Replace
                      </Button>
                      <label>
                        <Button size="sm" variant="outline" asChild>
                          <span>
                            <Image className="h-4 w-4 mr-2" />
                            Thumbnail
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleThumbnailUpload(model, f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(model)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </AdminTable>
          </div>

          <UploadDialog
            open={uploadDialog.open}
            onOpenChange={uploadDialog.setOpen}
            existingModel={uploadDialog.item}
            serverId={selectedServerId}
            onSuccess={() => { fetchModels(); uploadDialog.setOpen(false) }}
          />
        </>
      )}
    </div>
  )
}

function UploadDialog({
  open,
  onOpenChange,
  existingModel,
  serverId,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingModel: Character3DModel | null
  serverId: string
  onSuccess: () => void
}) {
  const [modelId, setModelId] = useState('')
  const [name, setName] = useState('')
  const upload = useGlbUpload()

  useEffect(() => {
    if (open) {
      setModelId(existingModel?.model_id ?? '')
      setName(existingModel?.name ?? '')
      upload.reset(existingModel?.credit ?? '')
    }
  }, [open, existingModel])

  const handleSubmit = () => {
    const mid = modelId.trim()
    return upload.submit({
      precheck: () => {
        if (!mid) toast.error('Model ID is required')
        return !!mid
      },
      chunked: (options) => uploadCharacterFileChunked({ ...options, modelId: mid, name: name.trim() || undefined, serverId }),
      endpoint: `/servers/${serverId}/characters/${mid}/3d/upload`,
      fields: { name: name.trim() },
      successMessage: 'Character model uploaded successfully',
      onSuccess,
    })
  }

  return (
    <GlbUploadDialog
      open={open}
      onOpenChange={onOpenChange}
      title={existingModel ? `Replace Model — ${existingModel.name ?? existingModel.model_id}` : 'Upload Character Model'}
      upload={upload}
      fileLabel=".glb File"
      replacing={!!existingModel}
      onSubmit={handleSubmit}
    >
      <div>
        <label className="text-sm font-medium">Model ID</label>
        <Input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="e.g. zombie_runner"
          className="mt-1"
          disabled={!!existingModel}
        />
        <p className="text-xs text-muted-foreground mt-1">Used in file paths and URLs</p>
      </div>

      <div>
        <label className="text-sm font-medium">Display Name <span className="text-muted-foreground">(Optional)</span></label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Zombie Runner"
          className="mt-1"
        />
      </div>

      {existingModel && <CurrentModelInfo title="Current model" model={existingModel} />}
    </GlbUploadDialog>
  )
}
