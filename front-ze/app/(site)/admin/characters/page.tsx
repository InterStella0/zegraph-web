"use client"

import { useState, useEffect, useCallback } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table'
import { Button } from 'components/ui/button'
import { Input } from 'components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/ui/dialog'
import { Badge } from 'components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'components/ui/select'
import { toast } from 'sonner'
import { Upload, Trash2, Search, Image } from 'lucide-react'
import {fetchApiUrl, fetchUrl} from 'utils/generalUtils'
import { uploadCharacterFileChunked } from 'utils/uploadUtils'
import { GlbUploadFields, useGlbUpload } from '../components/GlbUpload'
import { AdminHeader, EmptyRow } from '../components/AdminUI'
import { Character3DModel } from 'types/maps'
import {getCommunity} from "app/getCommunity.ts";
import {Community} from "types/community.ts";

type ServerOption = { id: string; displayName: string }

export default function AdminCharactersPage() {
  const [models, setModels] = useState<Character3DModel[]>([])
  const [loading, setLoading] = useState(false)
  const [servers, setServers] = useState<ServerOption[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedModel, setSelectedModel] = useState<Character3DModel | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [newModelDialogOpen, setNewModelDialogOpen] = useState(false)

  useEffect(() => {
    getCommunity().then((data: Community[]) => {
      const serverList: ServerOption[] = []
      for (const community of data) {
        for (const server of community.servers) {
          serverList.push({ id: server.id, displayName: `${community.name} — ${server.name}` })
        }
      }
      setServers(serverList)
      if (serverList.length > 0) {
        setSelectedServerId(serverList[0].id)
      }
    }).catch(() => toast.error('Failed to load servers'))
  }, [])

  const fetchModels = useCallback(async () => {
    if (!selectedServerId) return
    setLoading(true)
    try {
      const data = await fetchUrl(`/servers/${selectedServerId}/characters`) as Character3DModel[]
      setModels(data)
    } catch {
      toast.error('Failed to load character models')
    } finally {
      setLoading(false)
    }
  }, [selectedServerId])

  useEffect(() => {
    if (selectedServerId) fetchModels()
  }, [fetchModels, selectedServerId])

  const handleDelete = async (model: Character3DModel) => {
    if (!confirm(`Delete 3D model "${model.name ?? model.model_id}"?`)) return
    try {
      await fetchApiUrl(`/servers/${selectedServerId}/characters/${model.model_id}/3d`, { method: 'DELETE' })
      toast.success('Model deleted')
      fetchModels()
    } catch {
      toast.error('Failed to delete model')
    }
  }

  const handleThumbnailUpload = async (model: Character3DModel, file: File) => {
    const formData = new FormData()
    formData.append('thumbnail', file)
    try {
      const res = await fetch(`/api/servers/${selectedServerId}/characters/${model.model_id}/3d/thumbnail`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(await res.text())
      const updated: Character3DModel = await res.json()
      setModels(prev => prev.map(m => m.id === updated.id ? updated : m))
      toast.success('Thumbnail uploaded')
    } catch {
      toast.error('Failed to upload thumbnail')
    }
  }

  const filteredModels = models.filter(m =>
    (m.name ?? m.model_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.model_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6">
      <AdminHeader
        className="mb-6"
        title="Character 3D Model Management"
        description="Upload and manage 3D models (.glb files) for characters"
      />

      <div className="mb-4">
        <Select value={selectedServerId} onValueChange={setSelectedServerId}>
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Select a server" />
          </SelectTrigger>
          <SelectContent>
            {servers.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedServerId ? (
        <p className="text-muted-foreground">Please select a server to manage character models.</p>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search characters..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => { setSelectedModel(null); setNewModelDialogOpen(true) }}>
              <Upload className="h-4 w-4 mr-2" />
              Upload New
            </Button>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thumbnail</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>File Size</TableHead>
                  <TableHead>Credit</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <EmptyRow colSpan={7} className="text-center">Loading...</EmptyRow>
                ) : filteredModels.length === 0 ? (
                  <EmptyRow colSpan={7} className="text-center">No character models found</EmptyRow>
                ) : (
                  filteredModels.map((model) => (
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
                        <Badge variant="secondary">
                          {(model.file_size / (1024 * 1024)).toFixed(1)} MB
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {model.credit ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {model.uploader_name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedModel(model); setUploadDialogOpen(true) }}
                          >
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
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(model)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <UploadDialog
            open={uploadDialogOpen}
            onOpenChange={setUploadDialogOpen}
            existingModel={selectedModel}
            serverId={selectedServerId}
            onSuccess={() => { fetchModels(); setUploadDialogOpen(false) }}
          />

          <UploadDialog
            open={newModelDialogOpen}
            onOpenChange={setNewModelDialogOpen}
            existingModel={null}
            allowEditModelId
            serverId={selectedServerId}
            onSuccess={() => { fetchModels(); setNewModelDialogOpen(false) }}
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
  allowEditModelId = false,
  serverId,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingModel: Character3DModel | null
  allowEditModelId?: boolean
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
      direct: (file, credit) => {
        const formData = new FormData()
        formData.append('file', file)
        if (name.trim()) formData.append('name', name.trim())
        if (credit) formData.append('credit', credit)
        return fetchApiUrl(`/servers/${serverId}/characters/${mid}/3d/upload`, { method: 'POST', body: formData })
      },
      successMessage: 'Character model uploaded successfully',
      onSuccess,
    })
  }

  const isReplacing = !!existingModel

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isReplacing ? `Replace Model — ${existingModel.name ?? existingModel.model_id}` : 'Upload Character Model'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Model ID</label>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="e.g. zombie_runner"
              className="mt-1"
              disabled={!allowEditModelId}
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

          {isReplacing && existingModel && (
            <div className="p-3 border rounded-md bg-muted/50 text-sm">
              <p className="font-medium">Current model</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(existingModel.file_size / (1024 * 1024)).toFixed(1)} MB
                {existingModel.credit && ` • ${existingModel.credit}`}
              </p>
            </div>
          )}

          <GlbUploadFields
            upload={upload}
            fileLabel=".glb File"
            replacing={isReplacing}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
