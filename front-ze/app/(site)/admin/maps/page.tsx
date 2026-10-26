'use client'

import { useState, useEffect, type ComponentProps } from 'react'
import { Button } from 'components/ui/button'
import { Label } from 'components/ui/label'
import { Badge } from 'components/ui/badge'
import { Switch } from 'components/ui/switch'
import { Skeleton } from 'components/ui/skeleton'
import { Checkbox } from 'components/ui/checkbox'
import { SearchField } from 'components/ui/SearchField'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from 'components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu'
import { Settings, Box, Database, ImageOff, Upload, Trash2 } from 'lucide-react'
import { fetchApiUrl, getMapImage, orNull, range } from 'utils/generalUtils'
import { sendJson } from 'lib/sendJson'
import { useResource } from 'lib/hooks/useResource'
import { MapAuditHistory } from '../components/MapAuditHistory'
import {
  ActionItem, AdminPagination, Field, InputField, logFailure, OptionSelect, runAction, useAdminData, useResetForm,
  useSearchPaging,
} from '../components/AdminUI'
import { uploadFileChunked } from 'utils/uploadUtils'
import { CurrentModelInfo, GlbUploadDialog, useGlbUpload } from '../components/GlbUpload'
import { formatFileSize } from 'utils/format'
import type { MapWithModels } from 'types/maps'
import type {
  AdminMapEntry,
  AdminMapMetadataResponse,
  UpdateGlobalMapMetadataDto,
  UpdateServerMapMetadataDto,
} from 'types/admin'

type TriState = 'true' | 'false' | 'null'
type ResType = 'low' | 'high'

const boolToTri = (value: boolean | null | undefined) => String(value ?? null) as TriState
const TRI_VALUES: Record<TriState, boolean | null> = { true: true, false: false, null: null }
const TRI_LABELS: Record<TriState, string> = { true: 'Yes', false: 'No', null: 'unset' }

const toInput = (value: number | null | undefined) => value?.toString() ?? ''
const toNumber = (value: string) => (value ? Number(value) : null)

const RES_TYPES: { type: ResType; label: string; short: string }[] = [
  { type: 'low', label: 'Low-Res', short: 'Lo' },
  { type: 'high', label: 'High-Res', short: 'Hi' },
]

const modelOf = (map: MapWithModels | null, resType: ResType) =>
  resType === 'low' ? map?.low_res_model : map?.high_res_model

const GRID = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'

/** Save state whose button reads "Saved!" for two seconds after a successful save. */
function useFlashSave(failure: string) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const run = async (request: () => Promise<unknown>, onDone: () => void) => {
    setSaving(true)
    await runAction(request, () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onDone()
    }, { failure: logFailure(failure) })
    setSaving(false)
  }
  const saveButton = (label: string, onClick: () => void) => (
    <div className="flex justify-end">
      <Button onClick={onClick} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved!' : label}
      </Button>
    </div>
  )
  return { run, saveButton }
}

function NumberField(props: ComponentProps<typeof InputField>) {
  return <InputField fieldClassName="space-y-1.5" type="number" {...props} />
}

function TriSelect({ label, value, onChange, globalValue }: {
  label: string
  value: TriState
  onChange: (value: TriState) => void
  globalValue: boolean | null
}) {
  return (
    <Field label={label} className="space-y-1.5">
      <OptionSelect
        value={value}
        onChange={onChange}
        options={[['null', `— inherit global (${TRI_LABELS[boolToTri(globalValue)]})`], ['true', 'Yes'], ['false', 'No']]}
      />
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
  onDelete: (mapName: string, resType: ResType) => void
}) {
  const [resType, setResType] = useState<ResType>('low')
  const upload = useGlbUpload()

  const currentModel = modelOf(map, resType)

  useEffect(() => {
    if (open) upload.reset(currentModel?.credit || '')
  }, [open, resType, currentModel])

  const handleSubmit = () => upload.submit({
    chunked: (options) => uploadFileChunked({ ...options, mapName: map.map_name, resType }),
    endpoint: `/maps/${map.map_name}/3d/upload`,
    fields: { res_type: resType },
    successMessage: `${resType}-res model uploaded successfully`,
    onSuccess,
  })

  const handleDeleteModel = () => {
    onOpenChange(false)
    onDelete(map.map_name, resType)
  }

  return (
    <GlbUploadDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<>3D Models — {map.map_name}</>}
      titleClassName="font-mono text-sm"
      upload={upload}
      fileLabel="Upload New .glb File"
      replacing={!!currentModel}
      onSubmit={handleSubmit}
    >
      <div>
        <label className="text-sm font-medium">Resolution Type</label>
        <Tabs value={resType} onValueChange={(v) => setResType(v as ResType)} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            {RES_TYPES.map(({ type, label }) => {
              const model = modelOf(map, type)
              return (
                <TabsTrigger key={type} value={type}>
                  {label}
                  {model && <Badge variant="secondary" className="ml-2">{formatFileSize(model.file_size)}</Badge>}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </div>

      {currentModel && (
        <CurrentModelInfo
          title="Current Model"
          model={currentModel}
          action={
            <Button size="sm" variant="destructive" onClick={handleDeleteModel}>
              <Trash2 className="h-4 w-4" />
            </Button>
          }
        />
      )}
    </GlbUploadDialog>
  )
}

function ServerEditor({
  map,
  onSaved,
}: {
  map: AdminMapEntry
  onSaved: () => void
}) {
  const [selectedId, setSelectedId] = useState<string>(map.servers[0]?.server_id ?? '')
  const entry = map.servers.find((s) => s.server_id === selectedId) ?? null

  const [form, set, bind] = useResetForm(true, entry, () => ({
    isTryhard: boolToTri(entry?.is_tryhard),
    isCasual: boolToTri(entry?.is_casual),
    workshopId: toInput(entry?.workshop_id),
    resolvedWorkshopId: toInput(entry?.resolved_workshop_id),
    noNoms: entry ? entry.no_noms : false,
    minPlayers: toInput(entry?.min_players),
    maxPlayers: toInput(entry?.max_players),
  }))
  const { run, saveButton } = useFlashSave('Failed to save server map metadata:')

  const handleSave = () => {
    if (!entry) return
    const dto: UpdateServerMapMetadataDto = {
      server_id: entry.server_id,
      map_name: map.map_name,
      is_tryhard: TRI_VALUES[form.isTryhard],
      is_casual: TRI_VALUES[form.isCasual],
      workshop_id: toNumber(form.workshopId),
      resolved_workshop_id: toNumber(form.resolvedWorkshopId),
      no_noms: form.noNoms,
      min_players: toNumber(form.minPlayers),
      max_players: toNumber(form.maxPlayers),
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
        <OptionSelect
          value={selectedId}
          onChange={setSelectedId}
          options={map.servers.map((s): [string, string] => [s.server_id, s.server_name || s.server_id])}
          placeholder="Select a server"
        />
      </Field>

      {entry && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <TriSelect label="Tryhard Override" value={form.isTryhard} onChange={set('isTryhard')} globalValue={map.global_is_tryhard} />
            <TriSelect label="Casual Override" value={form.isCasual} onChange={set('isCasual')} globalValue={map.global_is_casual} />
            <NumberField
              label="Workshop ID Override"
              placeholder={map.global_workshop_id?.toString() ?? '(global)'}
              {...bind('workshopId')}
            />
            <NumberField
              label="Resolved Workshop ID Override"
              placeholder={map.global_resolved_workshop_id?.toString() ?? '(global)'}
              {...bind('resolvedWorkshopId')}
            />
            <NumberField label="Min Players" min={0} placeholder="0" {...bind('minPlayers')} />
            <NumberField label="Max Players" min={0} placeholder="no limit" {...bind('maxPlayers')} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="no-noms"
              checked={form.noNoms}
              onCheckedChange={(v) => set('noNoms')(Boolean(v))}
            />
            <Label htmlFor="no-noms" className="cursor-pointer">No Nominations</Label>
          </div>

          {saveButton('Save Server', handleSave)}
        </>
      )}
    </div>
  )
}

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
  const [form, set, bind] = useResetForm(true, map, () => ({
    globalIsTryhard: map?.global_is_tryhard ?? false,
    globalIsCasual: map?.global_is_casual ?? false,
    globalHasLasers: map?.global_has_lasers ?? false,
    globalWorkshopId: toInput(map?.global_workshop_id),
    globalResolvedWorkshopId: toInput(map?.global_resolved_workshop_id),
  }))
  const { run, saveButton } = useFlashSave('Failed to save global map metadata:')
  const [historyKey, setHistoryKey] = useState(0)

  const handleSaved = () => {
    setHistoryKey((k) => k + 1)
    onSaved()
  }

  const handleSaveGlobal = () => {
    if (!map) return
    const dto: UpdateGlobalMapMetadataDto = {
      map_name: map.map_name,
      is_tryhard: form.globalIsTryhard,
      is_casual: form.globalIsCasual,
      has_lasers: form.globalHasLasers,
      workshop_id: toNumber(form.globalWorkshopId),
      resolved_workshop_id: toNumber(form.globalResolvedWorkshopId),
    }
    return run(() => sendJson('/admin/map-metadata/global', 'PUT', dto), handleSaved)
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
                <SwitchRow label="Tryhard" hint="Mark as tryhard map" checked={form.globalIsTryhard} onChange={set('globalIsTryhard')} />
                <SwitchRow label="Casual" hint="Mark as casual map" checked={form.globalIsCasual} onChange={set('globalIsCasual')} />
                <SwitchRow label="Has Lasers" hint="Map contains killable lasers" checked={form.globalHasLasers} onChange={set('globalHasLasers')} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <NumberField label="Workshop ID" placeholder="Steam Workshop ID" {...bind('globalWorkshopId')} />
                <NumberField label="Resolved Workshop ID" placeholder="Resolved Workshop ID" {...bind('globalResolvedWorkshopId')} />
              </div>

              <p className="text-xs text-muted-foreground">
                Global settings apply to all servers unless a per-server override is set.
              </p>

              {saveButton('Save Global', handleSaveGlobal)}
            </div>
          </TabsContent>

          <TabsContent value="servers" className="flex-1 overflow-auto">
            <ServerEditor map={map} onSaved={handleSaved} />
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
  const serverId = entry.servers[0]?.server_id
  const { data: image, loading: imageLoading } = useResource(
    () => (serverId ? getMapImage(serverId, entry.map_name) : Promise.resolve(null)),
    [entry.map_name, serverId],
  )
  const imageUrl = image?.medium

  const handleEditModels = () => {
    onEditModels(entry, models ?? { map_name: entry.map_name, low_res_model: null, high_res_model: null })
  }

  return (
    <div className="rounded-xl border overflow-hidden bg-card relative group">
      <div className="aspect-video relative bg-muted">
        {imageLoading ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : !imageUrl ? (
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
            <ActionItem icon={Database} onClick={() => onEditMetadata(entry)}>Edit Metadata</ActionItem>
            <ActionItem icon={Upload} onClick={handleEditModels}>Edit 3D Models</ActionItem>
            <DropdownMenuSeparator />
            <ActionItem icon={Trash2} destructive onClick={() => onDelete(entry.map_name)}>Delete Map</ActionItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-3 space-y-2">
        <p className="font-mono text-xs truncate text-foreground" title={entry.map_name}>
          {entry.map_name}
        </p>

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

        <div className="flex items-center gap-1.5 flex-wrap">
          {RES_TYPES.map(({ type, short }) => {
            const hasModel = !!modelOf(models, type)
            return (
              <Badge
                key={type}
                variant={hasModel ? 'secondary' : 'outline'}
                className={`text-xs px-1.5 py-0 gap-1 ${hasModel ? '' : 'text-muted-foreground'}`}
              >
                <Box className="h-3 w-3" />
                {short}
              </Badge>
            )
          })}
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

type ActiveDialog =
  | { type: 'metadata'; entry: AdminMapEntry }
  | { type: 'models'; entry: AdminMapEntry; models: MapWithModels }
  | { type: 'delete'; mapName: string }
  | null

const PAGE_SIZE = 50

export default function MapManagementPage() {
  const { page, setPage, debouncedSearch, searchProps } = useSearchPaging()
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)
  const closeDialog = () => setActiveDialog(null)

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

  const { data: modelsMap, reload: fetchModels } = useAdminData(
    '/maps/all/3d',
    (data) => new Map((data as MapWithModels[]).map((m) => [m.map_name, m])),
    new Map<string, MapWithModels>(),
    '3D models',
  )

  const refreshCurrentMap = async () => {
    if (activeDialog?.type !== 'metadata') return
    const mapName = activeDialog.entry.map_name
    const data: AdminMapMetadataResponse | null = await orNull(fetchApiUrl('/admin/map-metadata', {
      params: { page: '1', limit: '50', search: mapName },
    }))
    const refreshed = data?.maps?.find((m) => m.map_name === mapName)
    if (refreshed) setActiveDialog({ type: 'metadata', entry: refreshed })
    fetchMetadata()
  }

  const handleModelsSaved = async () => {
    await fetchModels()
    closeDialog()
  }

  const confirmDeleteMap = () => {
    if (activeDialog?.type !== 'delete') return
    const { mapName } = activeDialog
    return runAction(() => fetchApiUrl(`/admin/map-metadata`, { method: 'DELETE', params: { map: mapName } }), () => {
      closeDialog()
      fetchMetadata()
    }, { success: `Map "${mapName}" deleted`, failure: 'Failed to delete map' })
  }

  const handleDeleteModel = (mapName: string, resType: ResType) => runAction(
    () => fetchApiUrl(`/maps/${mapName}/3d/${resType}`, { method: 'DELETE' }),
    fetchModels,
    { confirm: `Delete ${resType}-res model for ${mapName}?`, success: `${resType}-res model deleted`, failure: 'Failed to delete model' },
  )

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Map Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage map metadata, workshop IDs, and 3D models in one place.
        </p>
      </div>

      <SearchField className="max-w-sm" placeholder="Search maps…" {...searchProps} />

      {loadingMeta ? (
        <div className={GRID}>
          {range(10).map((i) => (
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
        <div className={GRID}>
          {maps.map((entry) => (
            <MapManagementCard
              key={entry.map_name}
              entry={entry}
              models={modelsMap.get(entry.map_name) ?? null}
              onEditMetadata={(e) => setActiveDialog({ type: 'metadata', entry: e })}
              onEditModels={(e, m) => setActiveDialog({ type: 'models', entry: e, models: m })}
              onDelete={(mapName) => setActiveDialog({ type: 'delete', mapName })}
            />
          ))}
        </div>
      )}

      <AdminPagination page={page} setPage={setPage} total={total} pageSize={PAGE_SIZE} noun="maps" />

      <EditMapDialog
        map={activeDialog?.type === 'metadata' ? activeDialog.entry : null}
        open={activeDialog?.type === 'metadata'}
        onClose={closeDialog}
        onSaved={refreshCurrentMap}
      />
      <ManageModelsDialog
        open={activeDialog?.type === 'models'}
        onOpenChange={(o) => { if (!o) closeDialog() }}
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
        onOpenChange={(o) => { if (!o) closeDialog() }}
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
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteMap}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
