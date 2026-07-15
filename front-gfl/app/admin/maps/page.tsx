'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from 'components/ui/button'
import { Input } from 'components/ui/input'
import { Label } from 'components/ui/label'
import { Badge } from 'components/ui/badge'
import { Switch } from 'components/ui/switch'
import { Skeleton } from 'components/ui/skeleton'
import { Progress } from 'components/ui/progress'
import { Checkbox } from 'components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from 'components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu'
import {
  ChevronLeft, ChevronRight, Search, Settings, Box, Database,
  ImageOff, Upload, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchApiUrl, getMapImage } from 'utils/generalUtils'
import { MapAuditHistory } from '../components/MapAuditHistory'
import { uploadFileChunked, CHUNKED_UPLOAD_THRESHOLD, UploadProgress } from 'utils/uploadUtils'
import type { Map3DModel, MapWithModels } from 'types/maps'
import type {
  AdminMapEntry,
  AdminMapMetadataResponse,
  AdminMapServerEntry,
  UpdateGlobalMapMetadataDto,
  UpdateServerMapMetadataDto,
} from 'types/admin'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TriState = 'true' | 'false' | 'null'

function boolToTri(v: boolean | null): TriState {
  if (v === true) return 'true'
  if (v === false) return 'false'
  return 'null'
}

function triToBool(v: TriState): boolean | null {
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

// ─── ManageModelsDialog ───────────────────────────────────────────────────────

function ManageModelsDialog({
  open,
  onOpenChange,
  map,
  onSuccess,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  map: MapWithModels
  onSuccess: () => void
  onDelete: (mapName: string, resType: 'low' | 'high') => void
}) {
  const [resType, setResType] = useState<'low' | 'high'>('low')
  const [file, setFile] = useState<File | null>(null)
  const [credit, setCredit] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const currentModel = resType === 'low' ? map.low_res_model : map.high_res_model

  useEffect(() => {
    if (open) {
      setFile(null)
      setCredit(currentModel?.credit || '')
      setUploadProgress(null)
      setAbortController(null)
    }
  }, [open, resType, currentModel])

  const handleSubmit = async () => {
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
        await uploadFileChunked({
          mapName: map.map_name,
          file,
          resType,
          credit: credit.trim() || undefined,
          signal: controller.signal,
          onProgress: (progress) => setUploadProgress(progress),
          onError: (error, chunkIndex) => {
            console.error(`Upload error${chunkIndex !== undefined ? ` at chunk ${chunkIndex}` : ''}:`, error)
          },
        })
      } else {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('res_type', resType)
        if (credit.trim()) formData.append('credit', credit.trim())
        await fetchApiUrl(`/maps/${map.map_name}/3d/upload`, {
          method: 'POST',
          body: formData,
        })
      }
      toast.success(`${resType}-res model uploaded successfully`)
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

  const handleCancelUpload = () => {
    if (abortController) abortController.abort()
  }

  const handleDeleteModel = async () => {
    if (!currentModel) return
    onOpenChange(false)
    await onDelete(map.map_name, resType)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">3D Models — {map.map_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Resolution Type</label>
            <Tabs value={resType} onValueChange={(v) => setResType(v as 'low' | 'high')} className="mt-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="low">
                  Low-Res
                  {map.low_res_model && (
                    <Badge variant="secondary" className="ml-2">
                      {(map.low_res_model.file_size / (1024 * 1024)).toFixed(1)} MB
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="high">
                  High-Res
                  {map.high_res_model && (
                    <Badge variant="secondary" className="ml-2">
                      {(map.high_res_model.file_size / (1024 * 1024)).toFixed(1)} MB
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {currentModel && (
            <div className="p-3 border rounded-md bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Current Model</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(currentModel.file_size / (1024 * 1024)).toFixed(1)} MB
                    {currentModel.credit && ` • ${currentModel.credit}`}
                  </p>
                </div>
                <Button size="sm" variant="destructive" onClick={handleDeleteModel}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">
              Upload New .glb File {currentModel && '(will replace existing)'}
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
                <Button variant="ghost" size="sm" onClick={handleCancelUpload} className="h-6 px-2">
                  Cancel Upload
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={uploading || !file}>
              {uploading ? 'Uploading...' : currentModel ? 'Replace' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── ServerEditor ─────────────────────────────────────────────────────────────

function ServerEditor({
  map,
  onSaved,
}: {
  map: AdminMapEntry
  onSaved: () => void
}) {
  const [selectedId, setSelectedId] = useState<string>(map.servers[0]?.server_id ?? '')
  const entry = map.servers.find((s) => s.server_id === selectedId) ?? null

  const [isTryhard, setIsTryhard] = useState<TriState>('null')
  const [isCasual, setIsCasual] = useState<TriState>('null')
  const [workshopId, setWorkshopId] = useState('')
  const [resolvedWorkshopId, setResolvedWorkshopId] = useState('')
  const [noNoms, setNoNoms] = useState(false)
  const [minPlayers, setMinPlayers] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (entry) {
      setIsTryhard(boolToTri(entry.is_tryhard))
      setIsCasual(boolToTri(entry.is_casual))
      setWorkshopId(entry.workshop_id?.toString() ?? '')
      setResolvedWorkshopId(entry.resolved_workshop_id?.toString() ?? '')
      setNoNoms(entry.no_noms)
      setMinPlayers(entry.min_players?.toString() ?? '')
      setMaxPlayers(entry.max_players?.toString() ?? '')
    }
  }, [entry])

  const handleSave = async () => {
    if (!entry) return
    setSaving(true)
    try {
      const dto: UpdateServerMapMetadataDto = {
        server_id: entry.server_id,
        map_name: map.map_name,
        is_tryhard: triToBool(isTryhard),
        is_casual: triToBool(isCasual),
        workshop_id: workshopId ? Number(workshopId) : null,
        resolved_workshop_id: resolvedWorkshopId ? Number(resolvedWorkshopId) : null,
        no_noms: noNoms,
        min_players: minPlayers ? Number(minPlayers) : null,
        max_players: maxPlayers ? Number(maxPlayers) : null,
      }
      await fetchApiUrl('/admin/map-metadata/server', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } catch (e) {
      console.error('Failed to save server map metadata:', e)
    } finally {
      setSaving(false)
    }
  }

  if (map.servers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        This map has no server entries.
      </p>
    )
  }

  const globalTryhardLabel = map.global_is_tryhard === true ? 'Yes' : map.global_is_tryhard === false ? 'No' : 'unset'
  const globalCasualLabel = map.global_is_casual === true ? 'Yes' : map.global_is_casual === false ? 'No' : 'unset'

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label>Server</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a server" />
          </SelectTrigger>
          <SelectContent>
            {map.servers.map((s) => (
              <SelectItem key={s.server_id} value={s.server_id}>
                {s.server_name || s.server_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entry && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tryhard Override</Label>
              <Select value={isTryhard} onValueChange={(v) => setIsTryhard(v as TriState)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">— inherit global ({globalTryhardLabel})</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Casual Override</Label>
              <Select value={isCasual} onValueChange={(v) => setIsCasual(v as TriState)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">— inherit global ({globalCasualLabel})</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Workshop ID Override</Label>
              <Input
                type="number"
                placeholder={map.global_workshop_id?.toString() ?? '(global)'}
                value={workshopId}
                onChange={(e) => setWorkshopId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Resolved Workshop ID Override</Label>
              <Input
                type="number"
                placeholder={map.global_resolved_workshop_id?.toString() ?? '(global)'}
                value={resolvedWorkshopId}
                onChange={(e) => setResolvedWorkshopId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Min Players</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={minPlayers}
                onChange={(e) => setMinPlayers(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Max Players</Label>
              <Input
                type="number"
                min={0}
                placeholder="no limit"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="no-noms"
              checked={noNoms}
              onCheckedChange={(v) => setNoNoms(Boolean(v))}
            />
            <Label htmlFor="no-noms" className="cursor-pointer">No Nominations</Label>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Server'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── EditMapDialog ────────────────────────────────────────────────────────────

function EditMapDialog({
  map,
  open,
  onClose,
  onSaved,
}: {
  map: AdminMapEntry | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [globalIsTryhard, setGlobalIsTryhard] = useState(false)
  const [globalIsCasual, setGlobalIsCasual] = useState(false)
  const [globalHasLasers, setGlobalHasLasers] = useState(false)
  const [globalWorkshopId, setGlobalWorkshopId] = useState('')
  const [globalResolvedWorkshopId, setGlobalResolvedWorkshopId] = useState('')
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [savedGlobal, setSavedGlobal] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => {
    if (map) {
      setGlobalIsTryhard(map.global_is_tryhard ?? false)
      setGlobalIsCasual(map.global_is_casual ?? false)
      setGlobalHasLasers(map.global_has_lasers ?? false)
      setGlobalWorkshopId(map.global_workshop_id?.toString() ?? '')
      setGlobalResolvedWorkshopId(map.global_resolved_workshop_id?.toString() ?? '')
    }
  }, [map])

  const handleSaveGlobal = async () => {
    if (!map) return
    setSavingGlobal(true)
    try {
      const dto: UpdateGlobalMapMetadataDto = {
        map_name: map.map_name,
        is_tryhard: globalIsTryhard,
        is_casual: globalIsCasual,
        has_lasers: globalHasLasers,
        workshop_id: globalWorkshopId ? Number(globalWorkshopId) : null,
        resolved_workshop_id: globalResolvedWorkshopId ? Number(globalResolvedWorkshopId) : null,
      }
      await fetchApiUrl('/admin/map-metadata/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      })
      setSavedGlobal(true)
      setTimeout(() => setSavedGlobal(false), 2000)
      setHistoryKey((k) => k + 1)
      onSaved()
    } catch (e) {
      console.error('Failed to save global map metadata:', e)
    } finally {
      setSavingGlobal(false)
    }
  }

  if (!map) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{map.map_name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 overflow-y-auto lg:overflow-y-visible">
        <Tabs defaultValue="global" className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0">
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="servers">
              Per-Server
              <Badge variant="secondary" className="ml-1.5 text-xs">{map.servers.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="flex-1 overflow-auto">
            <div className="space-y-5 pt-2">
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <Label className="text-sm font-medium">Tryhard</Label>
                    <p className="text-xs text-muted-foreground">Mark as tryhard map</p>
                  </div>
                  <Switch checked={globalIsTryhard} onCheckedChange={setGlobalIsTryhard} />
                </div>

                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <Label className="text-sm font-medium">Casual</Label>
                    <p className="text-xs text-muted-foreground">Mark as casual map</p>
                  </div>
                  <Switch checked={globalIsCasual} onCheckedChange={setGlobalIsCasual} />
                </div>

                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <Label className="text-sm font-medium">Has Lasers</Label>
                    <p className="text-xs text-muted-foreground">Map contains killable lasers</p>
                  </div>
                  <Switch checked={globalHasLasers} onCheckedChange={setGlobalHasLasers} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Workshop ID</Label>
                  <Input
                    type="number"
                    placeholder="Steam Workshop ID"
                    value={globalWorkshopId}
                    onChange={(e) => setGlobalWorkshopId(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Resolved Workshop ID</Label>
                  <Input
                    type="number"
                    placeholder="Resolved Workshop ID"
                    value={globalResolvedWorkshopId}
                    onChange={(e) => setGlobalResolvedWorkshopId(e.target.value)}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Global settings apply to all servers unless a per-server override is set.
              </p>

              <div className="flex justify-end">
                <Button onClick={handleSaveGlobal} disabled={savingGlobal}>
                  {savingGlobal ? 'Saving…' : savedGlobal ? 'Saved!' : 'Save Global'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="servers" className="flex-1 overflow-auto">
            <ServerEditor
              map={map}
              onSaved={() => {
                setHistoryKey((k) => k + 1)
                onSaved()
              }}
            />
          </TabsContent>
        </Tabs>

        <div className="min-h-0 flex flex-col lg:border-l lg:pl-4 max-lg:border-t max-lg:pt-4">
          <h3 className="text-sm font-medium mb-2 shrink-0">Edit History</h3>
          <div className="flex-1 min-h-0 lg:overflow-y-auto max-lg:max-h-56 max-lg:overflow-y-auto">
            <MapAuditHistory mapName={map.map_name} refreshKey={historyKey} />
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MapManagementCard({
  entry,
  models,
  onEditMetadata,
  onEditModels,
  onDelete,
}: {
  entry: AdminMapEntry
  models: MapWithModels | null
  onEditMetadata: (entry: AdminMapEntry) => void
  onEditModels: (entry: AdminMapEntry, models: MapWithModels) => void
  onDelete: (mapName: string) => void
}) {
  const [imageUrl, setImageUrl] = useState<string | undefined | null>(undefined)

  useEffect(() => {
    const serverId = entry.servers[0]?.server_id
    if (!serverId) {
      setImageUrl(null)
      return
    }
    let cancelled = false
    getMapImage(serverId, entry.map_name).then((result) => {
      if (!cancelled) setImageUrl(result ? result.medium : null)
    })
    return () => { cancelled = true }
  }, [entry.map_name, entry.servers])

  const handleEditModels = () => {
    onEditModels(entry, models ?? { map_name: entry.map_name, low_res_model: null, high_res_model: null })
  }

  return (
    <div className="rounded-xl border overflow-hidden bg-card relative group">
      {/* Thumbnail */}
      <div className="aspect-video relative bg-muted">
        {imageUrl === undefined ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : imageUrl === null ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
            <ImageOff className="h-8 w-8" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={entry.map_name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Cog button overlay */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2 h-7 w-7 bg-black/50 hover:bg-black/70 text-white border-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEditMetadata(entry)}>
              <Database className="h-4 w-4 mr-2" />
              Edit Metadata
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleEditModels}>
              <Upload className="h-4 w-4 mr-2" />
              Edit 3D Models
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(entry.map_name)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Map
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Info section */}
      <div className="p-3 space-y-2">
        <p className="font-mono text-xs truncate text-foreground" title={entry.map_name}>
          {entry.map_name}
        </p>

        {/* Metadata badges */}
        <div className="flex flex-wrap gap-1">
          {entry.global_is_tryhard === true && (
            <Badge className="text-xs px-1.5 py-0 bg-red-600 text-white">Tryhard</Badge>
          )}
          {entry.global_is_casual === true && (
            <Badge className="text-xs px-1.5 py-0 bg-blue-600 text-white">Casual</Badge>
          )}
          {entry.global_workshop_id !== null && (
            <span className="text-xs text-muted-foreground font-mono">
              WS:{entry.global_workshop_id}
            </span>
          )}
        </div>

        {/* 3D model status + server count */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={models?.low_res_model ? 'secondary' : 'outline'}
            className={`text-xs px-1.5 py-0 gap-1 ${models?.low_res_model ? '' : 'text-muted-foreground'}`}
          >
            <Box className="h-3 w-3" />
            Lo
          </Badge>
          <Badge
            variant={models?.high_res_model ? 'secondary' : 'outline'}
            className={`text-xs px-1.5 py-0 gap-1 ${models?.high_res_model ? '' : 'text-muted-foreground'}`}
          >
            <Box className="h-3 w-3" />
            Hi
          </Badge>
          {entry.servers.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {entry.servers.length} server{entry.servers.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Dialog union type ────────────────────────────────────────────────────────

type ActiveDialog =
  | { type: 'metadata'; entry: AdminMapEntry }
  | { type: 'models'; entry: AdminMapEntry; models: MapWithModels }
  | { type: 'delete'; mapName: string }
  | null

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function MapManagementPage() {
  const [maps, setMaps] = useState<AdminMapEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loadingMeta, setLoadingMeta] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [modelsMap, setModelsMap] = useState<Map<string, MapWithModels>>(new Map())

  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)

  const fetchMetadata = useCallback(async () => {
    setLoadingMeta(true)
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
      }
      if (debouncedSearch) params.search = debouncedSearch
      const data = await fetchApiUrl('/admin/map-metadata', { params }) as AdminMapMetadataResponse
      setMaps(data.maps ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      console.error('Failed to fetch map metadata:', e)
    } finally {
      setLoadingMeta(false)
    }
  }, [page, debouncedSearch])

  const fetchModels = useCallback(async () => {
    try {
      const data = await fetchApiUrl<MapWithModels[]>('/maps/all/3d')
      setModelsMap(new Map(data.map((m) => [m.map_name, m])))
    } catch (e) {
      console.error('Failed to fetch 3D models:', e)
    }
  }, [])

  useEffect(() => { fetchModels() }, [fetchModels])
  useEffect(() => { fetchMetadata() }, [fetchMetadata])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 350)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const refreshCurrentMap = useCallback(async () => {
    if (activeDialog?.type !== 'metadata') return
    const mapName = activeDialog.entry.map_name
    try {
      const data = await fetchApiUrl('/admin/map-metadata', {
        params: { page: '1', limit: '50', search: mapName },
      }) as AdminMapMetadataResponse
      const refreshed = data.maps.find((m) => m.map_name === mapName)
      if (refreshed) setActiveDialog({ type: 'metadata', entry: refreshed })
    } catch {}
    fetchMetadata()
  }, [activeDialog, fetchMetadata])

  const handleModelsSaved = useCallback(async () => {
    await fetchModels()
    setActiveDialog(null)
  }, [fetchModels])

  const handleDeleteMap = useCallback((mapName: string) => {
    setActiveDialog({ type: 'delete', mapName })
  }, [])

  const confirmDeleteMap = useCallback(async () => {
    if (activeDialog?.type !== 'delete') return
    const { mapName } = activeDialog
    try {
      await fetchApiUrl(`/admin/map-metadata`, { method: 'DELETE', params: { map: mapName } })
      toast.success(`Map "${mapName}" deleted`)
      setActiveDialog(null)
      fetchMetadata()
    } catch {
      toast.error('Failed to delete map')
    }
  }, [activeDialog, fetchMetadata])

  const handleDeleteModel = useCallback(async (mapName: string, resType: 'low' | 'high') => {
    if (!confirm(`Delete ${resType}-res model for ${mapName}?`)) return
    try {
      await fetchApiUrl(`/maps/${mapName}/3d/${resType}`, { method: 'DELETE' })
      toast.success(`${resType}-res model deleted`)
      fetchModels()
    } catch {
      toast.error('Failed to delete model')
    }
  }, [fetchModels])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Map Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage map metadata, workshop IDs, and 3D models in one place.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search maps…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {/* Card grid */}
      {loadingMeta ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-xl border overflow-hidden">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : maps.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">No maps found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {maps.map((entry) => (
            <MapManagementCard
              key={entry.map_name}
              entry={entry}
              models={modelsMap.get(entry.map_name) ?? null}
              onEditMetadata={(e) => setActiveDialog({ type: 'metadata', entry: e })}
              onEditModels={(e, m) => setActiveDialog({ type: 'models', entry: e, models: m })}
              onDelete={handleDeleteMap}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} maps
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <EditMapDialog
        map={activeDialog?.type === 'metadata' ? activeDialog.entry : null}
        open={activeDialog?.type === 'metadata'}
        onClose={() => setActiveDialog(null)}
        onSaved={refreshCurrentMap}
      />
      <ManageModelsDialog
        open={activeDialog?.type === 'models'}
        onOpenChange={(o) => { if (!o) setActiveDialog(null) }}
        map={
          activeDialog?.type === 'models'
            ? activeDialog.models
            : { map_name: '', low_res_model: null, high_res_model: null }
        }
        onSuccess={handleModelsSaved}
        onDelete={handleDeleteModel}
      />
      <Dialog
        open={activeDialog?.type === 'delete'}
        onOpenChange={(o) => { if (!o) setActiveDialog(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete map?</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{activeDialog?.type === 'delete' ? activeDialog.mapName : ''}</span>
              <br />
              This will permanently remove all play history, per-server config, and metadata. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteMap}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
