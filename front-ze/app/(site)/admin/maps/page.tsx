'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from 'components/ui/button'
import { Input } from 'components/ui/input'
import { Label } from 'components/ui/label'
import { Badge } from 'components/ui/badge'
import { Switch } from 'components/ui/switch'
import { Skeleton } from 'components/ui/skeleton'
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
  Search, Settings, Box, Database,
  ImageOff, Upload, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchApiUrl, getMapImage } from 'utils/generalUtils'
import { sendJson } from 'lib/sendJson'
import { MapAuditHistory } from '../components/MapAuditHistory'
import { AdminPagination, Field, useAdminData, useResetForm, useSearchPaging } from '../components/AdminUI'
import { uploadFileChunked } from 'utils/uploadUtils'
import { GlbUploadFields, useGlbUpload } from '../components/GlbUpload'
import type { MapWithModels } from 'types/maps'
import type {
  AdminMapEntry,
  AdminMapMetadataResponse,
  UpdateGlobalMapMetadataDto,
  UpdateServerMapMetadataDto,
} from 'types/admin'

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

const TRI_LABELS: Record<TriState, string> = { true: 'Yes', false: 'No', null: 'unset' }

function useFlashSave(failure: string) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const run = async (request: () => Promise<unknown>, onDone: () => void) => {
    setSaving(true)
    try {
      await request()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onDone()
    } catch (e) {
      console.error(failure, e)
    } finally {
      setSaving(false)
    }
  }
  return { saving, saved, run }
}

function TriSelect({ label, value, onChange, globalValue }: {
  label: string
  value: TriState
  onChange: (value: TriState) => void
  globalValue: boolean | null
}) {
  return (
    <Field label={label} className="space-y-1.5">
      <Select value={value} onValueChange={(v) => onChange(v as TriState)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="null">— inherit global ({TRI_LABELS[boolToTri(globalValue)]})</SelectItem>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  )
}

function SwitchRow({ label, hint, checked, onChange }: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

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
  const upload = useGlbUpload()

  const currentModel = resType === 'low' ? map.low_res_model : map.high_res_model

  useEffect(() => {
    if (open) upload.reset(currentModel?.credit || '')
  }, [open, resType, currentModel])

  const handleSubmit = () => upload.submit({
    chunked: (options) => uploadFileChunked({ ...options, mapName: map.map_name, resType }),
    direct: (file, credit) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('res_type', resType)
      if (credit) formData.append('credit', credit)
      return fetchApiUrl(`/maps/${map.map_name}/3d/upload`, {
        method: 'POST',
        body: formData,
      })
    },
    successMessage: `${resType}-res model uploaded successfully`,
    onSuccess,
  })

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

          <GlbUploadFields
            upload={upload}
            fileLabel="Upload New .glb File"
            replacing={!!currentModel}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
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

  const [form, set] = useResetForm(true, entry, () => ({
    isTryhard: entry ? boolToTri(entry.is_tryhard) : 'null' as TriState,
    isCasual: entry ? boolToTri(entry.is_casual) : 'null' as TriState,
    workshopId: entry?.workshop_id?.toString() ?? '',
    resolvedWorkshopId: entry?.resolved_workshop_id?.toString() ?? '',
    noNoms: entry ? entry.no_noms : false,
    minPlayers: entry?.min_players?.toString() ?? '',
    maxPlayers: entry?.max_players?.toString() ?? '',
  }))
  const { isTryhard, isCasual, workshopId, resolvedWorkshopId, noNoms, minPlayers, maxPlayers } = form
  const { saving, saved, run } = useFlashSave('Failed to save server map metadata:')

  const handleSave = () => {
    if (!entry) return
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
    return run(() => sendJson('/admin/map-metadata/server', 'PUT', dto), onSaved)
  }

  if (map.servers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        This map has no server entries.
      </p>
    )
  }

  return (
    <div className="space-y-4 pt-2">
      <Field label="Server" className="space-y-1.5">
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
      </Field>

      {entry && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <TriSelect label="Tryhard Override" value={isTryhard} onChange={set('isTryhard')} globalValue={map.global_is_tryhard} />
            <TriSelect label="Casual Override" value={isCasual} onChange={set('isCasual')} globalValue={map.global_is_casual} />

            <Field label="Workshop ID Override" className="space-y-1.5">
              <Input
                type="number"
                placeholder={map.global_workshop_id?.toString() ?? '(global)'}
                value={workshopId}
                onChange={(e) => set('workshopId')(e.target.value)}
              />
            </Field>

            <Field label="Resolved Workshop ID Override" className="space-y-1.5">
              <Input
                type="number"
                placeholder={map.global_resolved_workshop_id?.toString() ?? '(global)'}
                value={resolvedWorkshopId}
                onChange={(e) => set('resolvedWorkshopId')(e.target.value)}
              />
            </Field>

            <Field label="Min Players" className="space-y-1.5">
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={minPlayers}
                onChange={(e) => set('minPlayers')(e.target.value)}
              />
            </Field>

            <Field label="Max Players" className="space-y-1.5">
              <Input
                type="number"
                min={0}
                placeholder="no limit"
                value={maxPlayers}
                onChange={(e) => set('maxPlayers')(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="no-noms"
              checked={noNoms}
              onCheckedChange={(v) => set('noNoms')(Boolean(v))}
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
  const [form, set] = useResetForm(true, map, () => ({
    globalIsTryhard: map?.global_is_tryhard ?? false,
    globalIsCasual: map?.global_is_casual ?? false,
    globalHasLasers: map?.global_has_lasers ?? false,
    globalWorkshopId: map?.global_workshop_id?.toString() ?? '',
    globalResolvedWorkshopId: map?.global_resolved_workshop_id?.toString() ?? '',
  }))
  const { globalIsTryhard, globalIsCasual, globalHasLasers, globalWorkshopId, globalResolvedWorkshopId } = form
  const { saving: savingGlobal, saved: savedGlobal, run } = useFlashSave('Failed to save global map metadata:')
  const [historyKey, setHistoryKey] = useState(0)

  const handleSaveGlobal = () => {
    if (!map) return
    const dto: UpdateGlobalMapMetadataDto = {
      map_name: map.map_name,
      is_tryhard: globalIsTryhard,
      is_casual: globalIsCasual,
      has_lasers: globalHasLasers,
      workshop_id: globalWorkshopId ? Number(globalWorkshopId) : null,
      resolved_workshop_id: globalResolvedWorkshopId ? Number(globalResolvedWorkshopId) : null,
    }
    return run(() => sendJson('/admin/map-metadata/global', 'PUT', dto), () => {
      setHistoryKey((k) => k + 1)
      onSaved()
    })
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
                <SwitchRow label="Tryhard" hint="Mark as tryhard map" checked={globalIsTryhard} onChange={set('globalIsTryhard')} />
                <SwitchRow label="Casual" hint="Mark as casual map" checked={globalIsCasual} onChange={set('globalIsCasual')} />
                <SwitchRow label="Has Lasers" hint="Map contains killable lasers" checked={globalHasLasers} onChange={set('globalHasLasers')} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Workshop ID" className="space-y-1.5">
                  <Input
                    type="number"
                    placeholder="Steam Workshop ID"
                    value={globalWorkshopId}
                    onChange={(e) => set('globalWorkshopId')(e.target.value)}
                  />
                </Field>

                <Field label="Resolved Workshop ID" className="space-y-1.5">
                  <Input
                    type="number"
                    placeholder="Resolved Workshop ID"
                    value={globalResolvedWorkshopId}
                    onChange={(e) => set('globalResolvedWorkshopId')(e.target.value)}
                  />
                </Field>
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
  const { page, setPage, search, debouncedSearch, handleSearchChange } = useSearchPaging()

  const [modelsMap, setModelsMap] = useState<Map<string, MapWithModels>>(new Map())

  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)

  const params: Record<string, string> = {
    page: page.toString(),
    limit: PAGE_SIZE.toString(),
  }
  if (debouncedSearch) params.search = debouncedSearch
  const { data: { maps, total }, loading: loadingMeta, reload: fetchMetadata } = useAdminData(
    '/admin/map-metadata',
    (data) => ({ maps: (data as AdminMapMetadataResponse).maps ?? [], total: (data as AdminMapMetadataResponse).total ?? 0 }),
    { maps: [] as AdminMapEntry[], total: 0 },
    'map metadata',
    params,
  )

  const fetchModels = useCallback(async () => {
    try {
      const data: MapWithModels[] = await fetchApiUrl('/maps/all/3d')
      setModelsMap(new Map(data.map((m) => [m.map_name, m])))
    } catch (e) {
      console.error('Failed to fetch 3D models:', e)
    }
  }, [])

  useEffect(() => { fetchModels() }, [fetchModels])

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

      <AdminPagination page={page} setPage={setPage} total={total} pageSize={PAGE_SIZE} noun="maps" />

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
