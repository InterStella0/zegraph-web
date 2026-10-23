"use client"

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, Grid, Stats, useProgress, Html } from '@react-three/drei'
import { useTheme } from 'next-themes'
import { ReactNode, Suspense, useState, useRef, useEffect } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Button } from 'components/ui/button'
import { Vector3, Raycaster, SRGBColorSpace, ACESFilmicToneMapping, Box3, Euler, Object3D } from 'three'
import { DRACOLoader } from 'three-stdlib'
import { Maximize, Minimize } from 'lucide-react'
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "components/ui/accordion.tsx"
import { traverseSceneChunked } from 'utils/sceneProcessing'
import { getCachedModelData, cacheModelData } from 'utils/modelCache'
import { Map3DModel } from 'types/maps'
import { useTranslations } from 'next-intl'
import { formatFileSize } from 'utils/format'

const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox')

/** The model fields the viewer reads, so character models can be shown as well as map models. */
export type ViewerModel = Pick<Map3DModel, 'link_path' | 'res_type' | 'file_size' | 'credit' | 'uploader_name'>

type Phase = 'downloading' | 'parsing' | 'validating' | 'optimizing' | 'ready'

interface ProcessingState {
  phase: Phase
  progress: number
}

type PlayerStatus = { isOnGround: boolean; isCrouching: boolean; isSprinting: boolean; isOnLadder?: boolean }

type Listener = [target: EventTarget, type: string, handler: (event: any) => void, options?: AddEventListenerOptions]

/** Adds the listeners and returns a cleanup that removes them all. */
function listen(...listeners: Listener[]) {
  for (const [target, type, handler, options] of listeners) target.addEventListener(type, handler, options)
  return () => {
    for (const [target, type, handler] of listeners) target.removeEventListener(type, handler)
  }
}

const setupDracoLoader = () => {
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  dracoLoader.setDecoderConfig({ type: 'wasm' })
  dracoLoader.setWorkerLimit(8)
  dracoLoader.preload()
  return dracoLoader
}

const idle = () => new Promise<void>(resolve => {
  if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(() => resolve(), { timeout: 50 })
  else setTimeout(resolve, 0)
})

function Model({ modelMetadata, roughness, metalness, useBBoxCulling, renderDistance }: {
  modelMetadata: ViewerModel
  roughness: number
  metalness: number
  renderDistance: number
  useBBoxCulling: boolean
}) {
  const modelUrl = modelMetadata.link_path
  const { scene } = useGLTF(modelUrl, true, true, loader => loader.setDRACOLoader(setupDracoLoader()))
  const [processingState, setProcessingState] = useState<ProcessingState>({ phase: 'parsing', progress: 0 })
  const isReady = processingState.phase === 'ready'

  useEffect(() => {
    if (!scene) return

    async function validateScene() {
      setProcessingState({ phase: 'validating', progress: 0 })
      const cached = await getCachedModelData(modelUrl)
      const problematicObjects: any[] = []

      if (cached) {
        let traversalIndex = 0
        scene.traverse(child => {
          if (cached.objectsToRemove.includes(traversalIndex++)) problematicObjects.push(child)
        })
      } else {
        const objectsToRemove: number[] = []
        let traversalIndex = 0
        let meshCount = 0
        let dracoMeshCount = 0

        await traverseSceneChunked(scene, (child: any) => {
          const currentIndex = traversalIndex++
          const remove = () => {
            objectsToRemove.push(currentIndex)
            problematicObjects.push(child)
          }
          if (!child) return remove()
          if (child.isSkinnedMesh && !child.skeleton) remove()
          if (child.isLOD || child.type === 'LOD') {
            console.warn('⚠ LOD object found:', child.name || 'unnamed', 'Removing to prevent update errors')
            return remove()
          }
          if ((child.isSprite || child.type === 'Sprite') && !child.material) {
            console.warn('⚠ Sprite without material:', child.name || 'unnamed', 'Removing')
            return remove()
          }
          if (!child.isMesh) return

          meshCount++
          if (child.geometry?.attributes && child.geometry.userData?.draco) dracoMeshCount++
          if (!child.material || !child.geometry) {
            console.warn(`⚠ Mesh without ${child.material ? 'geometry' : 'material'}:`, child.name || 'unnamed', 'Removing')
            return remove()
          }
          if (Array.isArray(child.material)) {
            const validMaterials = child.material.filter((mat: any) => mat != null)
            if (validMaterials.length !== child.material.length) {
              console.warn(`⚠ Mesh has undefined materials:`, child.name || 'unnamed')
              child.material = validMaterials
            }
            if (validMaterials.length === 0) {
              console.warn('⚠ Mesh has no valid materials, removing:', child.name || 'unnamed')
              remove()
            }
          }
        }, {
          chunkSize: 50,
          onProgress: progress => setProcessingState(prev => ({ ...prev, progress })),
        })

        await cacheModelData(modelUrl, { modelUrl, objectsToRemove, meshCount, dracoMeshCount })
      }

      let removedObjects = 0
      for (const child of problematicObjects) {
        if (child?.parent) {
          child.parent.remove(child)
          removedObjects++
        }
      }
      if (removedObjects > 0) console.warn(`⚠ Removed ${removedObjects} problematic objects${cached ? ' from cache' : ''}`)

      setProcessingState({ phase: 'optimizing', progress: 0 })
    }

    validateScene()
  }, [scene, modelUrl])

  useEffect(() => {
    if (!scene || processingState.phase !== 'optimizing') return

    async function optimizeMaterials() {
      setProcessingState({ phase: 'ready', progress: 0 })

      const materials: any[] = []
      scene.traverse((child: any) => {
        if (child.isMesh) materials.push(...[child.material].flat())
      })

      for (let i = 0; i < materials.length; i += 10) {
        await idle()
        for (const mat of materials.slice(i, i + 10)) {
          if (!mat) continue
          try {
            if (mat.map) mat.map.colorSpace = SRGBColorSpace
            if (mat.emissiveMap) mat.emissiveMap.colorSpace = SRGBColorSpace
            if (mat.metalness !== undefined) mat.metalness = metalness
            if (mat.roughness !== undefined) mat.roughness = roughness
            mat.needsUpdate = true
          } catch (err) {
            console.warn('Error updating material:', err, mat)
          }
        }
      }
    }

    optimizeMaterials()
  }, [scene, processingState.phase, roughness, metalness])

  useEffect(() => {
    if (!scene || !isReady) return

    scene.traverse((child: any) => {
      if (!child) return
      if (child.isLOD && !Array.isArray(child.levels)) {
        child.levels = []
        console.warn('Fixed LOD with missing levels:', child.name)
      }
      if (child.isSprite && !child.material) {
        child.visible = false
        console.warn('Hidden Sprite with missing material:', child.name)
      }
      if (child.isLight && child.shadow && !child.shadow.camera) {
        console.warn('Light has shadow but no shadow camera:', child.name)
        child.castShadow = false
      }
      if (child.children) child.children = child.children.filter((c: any) => c != null)
    })

    scene.onBeforeRender = () => scene.traverse((child: any) => {
      if (!child) return
      const broken = (child.isMesh && (!child.geometry || !child.material))
        || (child.isSprite && !child.material)
        || (child.isLOD && !child.levels?.length)
      if (broken) child.visible = false
    })

    return () => {
      scene.onBeforeRender = null
    }
  }, [scene, isReady])

  useFrame(({ camera }) => {
    if (!isReady) return

    scene.traverse((child: any) => {
      if (!child || !child.isMesh) return
      const userData = child.userData
      if (useBBoxCulling && !userData.boundingBox) userData.boundingBox = new Box3().setFromObject(child)
      const distance = useBBoxCulling
        ? userData.boundingBox.distanceToPoint(camera.position)
        : camera.position.distanceTo(child.position)
      if (userData.originalVisible === undefined) userData.originalVisible = child.visible
      child.visible = distance > renderDistance ? false : userData.originalVisible
    })
  })

  if (!isReady) return <LoadingFallback processingState={processingState} modelMetadata={modelMetadata} />
  return <primitive object={scene} />
}

const PHASE_LABELS: Partial<Record<Phase, string>> = {
  parsing: 'phaseParsing',
  validating: 'phaseValidating',
  optimizing: 'phaseOptimizing',
}

function LoadingFallback({ processingState, modelMetadata }: { processingState: ProcessingState, modelMetadata?: ViewerModel }) {
  const t = useTranslations('maps.viewer3d')
  const { active, progress: downloadProgress, loaded, total } = useProgress()
  const percent = Math.round(active ? downloadProgress : processingState.progress || 0)

  return (
    <Html center>
      <div className="flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-6 rounded-lg min-w-64">
        <div className="text-lg font-medium text-foreground mb-2">
          {active ? t('phaseDownloading') : t(PHASE_LABELS[processingState.phase] ?? 'phaseReady')}
        </div>
        <div className="text-sm text-muted-foreground">
          {active ? t('downloadProgress', {loaded, total, percent}) : t('percentComplete', {percent})}
        </div>
        <div className="w-48 h-2 bg-secondary rounded-full mt-4 overflow-hidden">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
        {modelMetadata && (
          <div className="mt-4 pt-4 border-t border-border/50 w-full">
            <div className="text-xs text-muted-foreground space-y-1">
              {modelMetadata.credit && <div>{t('modelBy', {credit: modelMetadata.credit})}</div>}
              <div className="flex gap-4">
                <span>{t('resolution')} {modelMetadata.res_type}</span>
                <span>{t('size')} {formatFileSize(modelMetadata.file_size)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Html>
  )
}

function ErrorFallback({ error }: { error: Error }) {
  const t = useTranslations('maps.viewer3d')
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <h3 className="text-lg font-semibold mb-2">{t('failedToLoadModel')}</h3>
      <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
        <p className="font-mono">{t('noModelYet')}</p>
        {/[dD]raco/.test(error.message) && (
          <>
            <p className="mt-3 font-semibold text-yellow-600 dark:text-yellow-500">{t('dracoIssue')}</p>
            <p className="mt-1">{t('dracoEnsure')}</p>
            <p className="mt-1">{t('dracoInternet')}</p>
          </>
        )}
      </div>
    </div>
  )
}

function CustomPointerLockControls({ sensitivity }: { sensitivity: number }) {
  const { camera, gl } = useThree()
  const euler = useRef(new Euler(0, 0, 0, 'YXZ'))
  const isLockedRef = useRef(false)

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isLockedRef.current) return
      euler.current.setFromQuaternion(camera.quaternion)
      euler.current.y -= (event.movementX || 0) * 0.002 * sensitivity
      euler.current.x -= (event.movementY || 0) * 0.002 * sensitivity
      euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x))
      camera.quaternion.setFromEuler(euler.current)
    }

    return listen(
      [gl.domElement, 'click', () => {
        if (!isLockedRef.current) gl.domElement.requestPointerLock()
      }],
      [document, 'mousemove', handleMouseMove],
      [document, 'pointerlockchange', () => {
        isLockedRef.current = document.pointerLockElement === gl.domElement
      }],
    )
  }, [camera, gl, sensitivity])

  return null
}

function RangeSetting({ label, display, min, max, step, value, onChange, hint }: {
  label: string, display: ReactNode, min: string, max: string, step: string, value: number, onChange: (value: number) => void, hint?: string
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-mono">{display}</span>
      </div>
      <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
      />
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  )
}

function SettingsSection({ title, first = false, children }: { title: string, first?: boolean, children: ReactNode }) {
  return (
    <>
      <div className={`text-xs font-semibold mb-3${first ? '' : ' mt-4 pt-3 border-t'}`}>{title}</div>
      <div className="space-y-3">{children}</div>
    </>
  )
}

function InfoRow({ label, className, children }: { label: string, className?: string, children: ReactNode }) {
  return children ? (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={className}>{children}</span>
    </div>
  ) : null
}

const CONTROL_MODES = [
  { mode: 'orbit', label: 'orbit', key: 'F1', renderDistance: 300 },
  { mode: 'fly', label: 'noclip', key: 'F2', renderDistance: 500 },
  { mode: 'walk', label: 'walkMode', key: 'F3', renderDistance: 90 },
] as const

type ControlMode = typeof CONTROL_MODES[number]['mode']

const WASD_KEYS = { KeyW: 'forward', KeyS: 'backward', KeyA: 'left', KeyD: 'right' } as const

function listenGameKeys(gameKeys: string[], onKey: (e: KeyboardEvent, pressed: boolean) => void) {
  const handler = (pressed: boolean) => (e: KeyboardEvent) => {
    if (gameKeys.includes(e.code)) {
      e.preventDefault()
      e.stopPropagation()
    }
    onKey(e, pressed)
  }
  return listen([document, 'keydown', handler(true)], [document, 'keyup', handler(false)])
}

function FlyControls({ speed, enabled }: { speed: number; enabled: boolean }) {
  const { camera } = useThree()
  const moveState = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false })

  useEffect(() => {
    if (!enabled) return
    const keys: Record<string, keyof typeof moveState.current> = { ...WASD_KEYS, Space: 'up', ShiftLeft: 'down', ShiftRight: 'down' }
    return listenGameKeys(Object.keys(keys), (e, pressed) => {
      if (pressed && e.ctrlKey && e.code in WASD_KEYS) return
      if (keys[e.code]) moveState.current[keys[e.code]] = pressed
    })
  }, [enabled])

  useFrame((_, delta) => {
    if (!enabled) return
    const move = moveState.current
    const direction = camera.getWorldDirection(new Vector3())
    const right = new Vector3().crossVectors(camera.up, direction).normalize()
    const velocity = new Vector3()

    if (move.forward) velocity.add(direction)
    if (move.backward) velocity.sub(direction)
    if (move.left) velocity.add(right)
    if (move.right) velocity.sub(right)
    if (move.up) velocity.y += 1
    if (move.down) velocity.y -= 1

    if (velocity.length() > 0) camera.position.add(velocity.normalize().multiplyScalar(speed * delta))
  })

  return null
}

const PLAYER_HEIGHT = 1.3
const CROUCH_HEIGHT = 0.9
const GRAVITY = -20
const JUMP_FORCE = 8
const WALK_SPEED = 5
const SPRINT_MULTIPLIER = 1.8
const CROUCH_MULTIPLIER = 0.5
const LADDER_CLIMB_SPEED = 3
const PLAYER_RADIUS = 0.3
const COLLISION_DISTANCE = 0.6

const isLadder = (obj: Object3D) =>
  obj.name.toLowerCase().includes('ladder') || obj.parent?.name.toLowerCase().includes('ladder') || obj.userData?.isLadder === true

function WalkControls({ speed, enabled, onStateChange }: {
  speed: number
  enabled: boolean
  onStateChange?: (state: PlayerStatus) => void
}) {
  const { camera, scene } = useThree()
  const moveState = useRef({ forward: false, backward: false, left: false, right: false, sprint: false, crouch: false })

  const playerState = useRef({
    velocity: new Vector3(0, 0, 0),
    isOnGround: false,
    isCrouching: false,
    previousGroundY: 0,
    previousTargetHeight: 1.7,
    isOnLadder: false,
  })

  const raycastCache = useRef({
    frame: 0,
    groundCheck: { isOnGround: false, distance: Infinity, groundY: 0 },
    ladderCheck: { isNearLadder: false },
  })

  useEffect(() => {
    if (!enabled) return

    const raycaster = new Raycaster()
    raycaster.set(camera.position, new Vector3(0, -1, 0))
    let ground = raycaster.intersectObjects(scene.children, true)[0]
    if (!ground) {
      raycaster.set(camera.position, new Vector3(0, 1, 0))
      ground = raycaster.intersectObjects(scene.children, true)[0]
    }
    if (ground) camera.position.y = ground.point.y + PLAYER_HEIGHT

    const keys: Record<string, keyof typeof moveState.current> = { ...WASD_KEYS, ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyC: 'crouch' }
    return listenGameKeys([...Object.keys(keys), 'Space'], (e, pressed) => {
      const player = playerState.current
      if (e.code === 'Space') {
        if (!pressed) return
        if (player.isOnLadder) {
          player.isOnLadder = false
          player.velocity.y = JUMP_FORCE
        } else if (player.isOnGround && !player.isCrouching) {
          player.velocity.y = JUMP_FORCE
        }
        return
      }
      const key = keys[e.code]
      if (!key) return
      moveState.current[key] = pressed
      if (key === 'crouch') player.isCrouching = pressed
    })
  }, [camera, enabled])

  useFrame((state, delta) => {
    if (!enabled) return
    const move = moveState.current
    const player = playerState.current
    const cache = raycastCache.current
    const raycaster = new Raycaster()
    const frame = Math.floor(state.clock.elapsedTime * 60)

    if (frame !== cache.frame) {
      cache.frame = frame

      const forwardDir = new Vector3()
      camera.getWorldDirection(forwardDir)
      forwardDir.y = 0
      forwardDir.normalize()

      const ladderRaycaster = new Raycaster()
      ladderRaycaster.set(camera.position, forwardDir)
      ladderRaycaster.far = 0.8
      cache.ladderCheck.isNearLadder = ladderRaycaster.intersectObjects(scene.children, true).some(hit => isLadder(hit.object))

      raycaster.set(camera.position, new Vector3(0, -1, 0))
      const ground = raycaster.intersectObjects(scene.children, true)[0]
      const groundDistance = ground ? ground.distance : Infinity
      cache.groundCheck = {
        isOnGround: groundDistance < (player.isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT) + 0.1,
        distance: groundDistance,
        groundY: ground ? ground.point.y : 0,
      }
    }

    const isNearLadder = cache.ladderCheck.isNearLadder
    const targetHeight = player.isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT

    if (isNearLadder && move.forward && !player.isOnLadder) {
      player.isOnLadder = true
      player.velocity.y = 0
    }
    if (player.isOnLadder && (move.backward || !isNearLadder)) player.isOnLadder = false

    player.isOnGround = cache.groundCheck.isOnGround

    if (player.isOnLadder) {
      player.velocity.y = 0
    } else if (player.isOnGround) {
      const groundY = cache.groundCheck.groundY
      const heightChanged = Math.abs(targetHeight - player.previousTargetHeight) > 0.01
      const groundChanged = Math.abs(groundY - player.previousGroundY) > 0.01

      if (player.velocity.y < 0 || heightChanged || groundChanged) {
        player.velocity.y = 0
        camera.position.y = groundY + targetHeight
        player.previousGroundY = groundY
        player.previousTargetHeight = targetHeight
      }
    } else {
      player.velocity.y += GRAVITY * delta
    }

    const direction = new Vector3()
    camera.getWorldDirection(direction)
    direction.y = 0
    direction.normalize()

    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize()
    const movement = new Vector3()

    if (player.isOnLadder) {
      if (move.forward) movement.y += 1
      if (move.backward) movement.y -= 1
      if (move.left) movement.add(right.clone().multiplyScalar(0.5))
      if (move.right) movement.sub(right.clone().multiplyScalar(0.5))

      if (movement.length() > 0) camera.position.add(movement.normalize().multiplyScalar(LADDER_CLIMB_SPEED * speed * delta))
    } else {
      if (move.forward) movement.add(direction)
      if (move.backward) movement.sub(direction)
      if (move.left) movement.add(right)
      if (move.right) movement.sub(right)

      if (movement.length() > 0) {
        let currentSpeed = WALK_SPEED * speed
        if (move.sprint && !player.isCrouching) currentSpeed *= SPRINT_MULTIPLIER
        else if (player.isCrouching) currentSpeed *= CROUCH_MULTIPLIER
        movement.normalize().multiplyScalar(currentSpeed * delta)

        let canMove = true
        let hitLadder = false

        if (movement.length() > 0.01) {
          const movementDirection = movement.clone().normalize()

          for (const height of [0.2, targetHeight * 0.6]) {
            for (const angle of [0, Math.PI / 2]) {
              const offset = new Vector3(Math.cos(angle) * PLAYER_RADIUS, height, Math.sin(angle) * PLAYER_RADIUS)
              raycaster.set(camera.position.clone().add(offset), movementDirection)
              raycaster.far = COLLISION_DISTANCE
              const collision = raycaster.intersectObjects(scene.children, true)[0]

              if (collision && collision.distance < COLLISION_DISTANCE) {
                if (isLadder(collision.object)) {
                  hitLadder = true
                } else {
                  canMove = false
                  break
                }
              }
            }
            if (!canMove) break
          }
        }

        if (hitLadder && move.forward && !player.isOnLadder) {
          player.isOnLadder = true
          player.velocity.y = 0
        }

        if (canMove) {
          camera.position.x += movement.x
          camera.position.z += movement.z
        }
      }
    }

    if (!player.isOnLadder) camera.position.y += player.velocity.y * delta

    onStateChange?.({
      isOnGround: player.isOnGround,
      isCrouching: player.isCrouching,
      isSprinting: move.sprint && !player.isCrouching,
      isOnLadder: player.isOnLadder,
    })
  })

  return null
}

function StatusLine({ dot, text = '', children }: { dot: string, text?: string, children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${text}`}>
      <div className={`w-2 h-2 rounded-full ${dot}`} />
      {children}
    </div>
  )
}

function SpeedIndicator({ speed, mode, playerState }: { speed: number, mode: ControlMode, playerState?: PlayerStatus }) {
  const t = useTranslations('maps.viewer3d')
  return (
    <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 z-10 p-2 sm:p-3 bg-background/95 backdrop-blur rounded-lg border shadow-lg">
      <div className="text-[10px] sm:text-xs text-muted-foreground mb-1">
        {mode === 'walk' ? t('walkSpeed') : t('flySpeed')}
      </div>
      <div className="text-sm sm:text-lg font-bold">{speed.toFixed(1)}x</div>
      <div className="hidden sm:block text-xs text-muted-foreground mt-1">{t('scrollToAdjust')}</div>

      {mode === 'walk' && playerState && (
        <div className="mt-3 pt-3 border-t border-border space-y-1">
          {playerState.isOnLadder ? (
            <StatusLine dot="bg-purple-500" text="text-purple-500">{t('onLadder')}</StatusLine>
          ) : (
            <StatusLine dot={playerState.isOnGround ? 'bg-green-500' : 'bg-red-500'}>
              {playerState.isOnGround ? t('onGround') : t('inAir')}
            </StatusLine>
          )}
          {playerState.isCrouching && <StatusLine dot="bg-yellow-500" text="text-yellow-500">{t('crouching')}</StatusLine>}
          {playerState.isSprinting && !playerState.isCrouching && (
            <StatusLine dot="bg-blue-500" text="text-blue-500">{t('sprinting')}</StatusLine>
          )}
        </div>
      )}
    </div>
  )
}

const DEFAULT_SETTINGS = { mouseSensitivity: isFirefox ? 3.5 : 1.0, exposure: .007, ambient: 100, directional: 0.5, roughness: 0.7, metalness: 0.1 }

export default function MapViewer3D({ modelMetadata }: { modelMetadata: ViewerModel }) {
  const t = useTranslations('maps.viewer3d')
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [showStats, setShowStats] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [controlMode, setControlMode] = useState<ControlMode>('orbit')
  const [moveSpeed, setMoveSpeed] = useState(10)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [useBBoxCulling, setUseBBoxCulling] = useState(true)
  const [renderDistance, setRenderDistance] = useState(300)
  const [showControlsHelp, setShowControlsHelp] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playerState, setPlayerState] = useState<PlayerStatus>({ isOnGround: true, isCrouching: false, isSprinting: false })

  const bind = (key: keyof typeof DEFAULT_SETTINGS) => ({
    value: settings[key],
    onChange: (value: number) => setSettings(prev => ({ ...prev, [key]: value })),
  })

  useEffect(() => {
    const originalError = console.error
    console.error = (...args: any[]) => {
      if (typeof args[0] === 'string' && args[0].includes('The user has exited the lock before this request was completed')) return
      originalError.apply(console, args)
    }
    return () => {
      console.error = originalError
    }
  }, [])

  const handleControlModeChange = (mode: ControlMode) => {
    setControlMode(mode)
    if (mode === 'orbit' && document.pointerLockElement) document.exitPointerLock()
    if (mode === 'walk') setMoveSpeed(1)
    else if (mode === 'fly' && moveSpeed < 5) setMoveSpeed(10)
  }

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const mode = CONTROL_MODES.find(({ key }) => key === e.key)
      if (mode) {
        handleControlModeChange(mode.mode)
        e.preventDefault()
      } else if ((e.key === 'f' || e.key === 'F') && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        void toggleFullscreen()
      }
    }

    return listen(
      [document, 'fullscreenchange', () => setIsFullscreen(!!document.fullscreenElement)],
      [document, 'keydown', handleKeyPress],
    )
  }, [toggleFullscreen])

  useEffect(() => {
    setRenderDistance(CONTROL_MODES.find(({ mode }) => mode === controlMode).renderDistance)
    const handleWheel = (e: WheelEvent) => {
      if (controlMode !== 'orbit' && document.pointerLockElement) {
        e.preventDefault()
        setMoveSpeed(prev => Math.max(1, Math.min(100, prev + (e.deltaY > 0 ? -1 : 1))))
      }
    }
    return listen([document, 'wheel', handleWheel, { passive: false }])
  }, [controlMode])

  const toggles: { onClick: () => void, label: string, mobileLabel?: string, title?: string }[] = [
    {
      onClick: () => setShowControlsHelp(!showControlsHelp),
      label: showControlsHelp ? t('hideControls') : t('showControls'),
      mobileLabel: showControlsHelp ? t('hideControlsHelp') : t('showControlsHelp'),
    },
    { onClick: () => setShowStats(!showStats), label: showStats ? t('hideStats') : t('showStats') },
    {
      onClick: () => setWireframe(!wireframe),
      label: t('wireframe'),
      mobileLabel: t('wireframeToggle', {state: wireframe ? t('on') : t('off')}),
    },
    {
      onClick: () => setUseBBoxCulling(!useBBoxCulling),
      label: t('culling', {mode: useBBoxCulling ? 'BBox' : 'Center'}),
      title: useBBoxCulling ? t('cullingBBoxTitle') : t('cullingCenterTitle'),
    },
  ]

  const controlHelp: Record<string, [string, [string, string][]]> = {
    orbit: [t('orbitControls'), [[t('leftMouse'), t('rotate')], [t('rightMouse'), t('pan')], [t('scroll'), t('zoom')]]],
    fly: [t('flyControls'), [
      ['WASD:', t('move')], [t('space'), t('up')], ['Shift:', t('down')], [t('mouse'), t('lookAround')], [t('scroll'), t('speedLabel')],
    ]],
    walk: [t('walkControls'), [
      ['WASD:', t('walkAction')], [t('space'), t('jump')], ['Shift:', t('sprint')], ['C:', t('crouch')],
      [t('mouse'), t('lookAround')], [t('scroll'), t('speedLabel')],
    ]],
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div ref={containerRef} className="w-full h-full relative">
        <div className="absolute top-2 sm:top-4 right-2 sm:right-4 z-10 flex gap-1 sm:gap-2 flex-wrap justify-end max-w-[calc(100%-1rem)] sm:max-w-none">
          {CONTROL_MODES.map(({ mode, label, key }) => (
            <Button
              key={mode}
              size="sm"
              className="text-xs sm:text-sm px-2 sm:px-3"
              variant={controlMode === mode ? 'default' : 'secondary'}
              onClick={() => handleControlModeChange(mode)}
            >
              {t(label)}<span className="hidden sm:inline"> ({key})</span>
            </Button>
          ))}
          {toggles.map((toggle, index) => (
            <Button
              key={index}
              size="sm"
              className={index === 0 ? "hidden sm:inline-flex text-xs sm:text-sm px-2 sm:px-3" : "hidden sm:inline-flex"}
              variant="secondary"
              onClick={toggle.onClick}
              title={toggle.title}
            >
              {toggle.label}
            </Button>
          ))}
          <Button
            size="sm"
            className="px-2 sm:px-3"
            variant="secondary"
            onClick={toggleFullscreen}
            title={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>

        {controlMode !== 'orbit' && (
          <SpeedIndicator speed={moveSpeed} mode={controlMode} playerState={controlMode === 'walk' ? playerState : undefined} />
        )}

        <div className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 px-2 z-10 bg-background/70 backdrop-blur rounded-lg border shadow-lg min-w-44 sm:min-w-60 max-h-[60vh] sm:max-h-[80vh] overflow-y-auto">
          <Accordion type="single" collapsible className="max-w-lg">
            <AccordionItem value="options">
              <AccordionTrigger>{t('settings')}</AccordionTrigger>
              <AccordionContent>
                <SettingsSection title={t('controls')} first>
                  <RangeSetting label={t('mouseSensitivity')} display={`${settings.mouseSensitivity.toFixed(2)}x`} min="0.1" max="5" step="0.1" {...bind('mouseSensitivity')} hint={isFirefox ? t('firefoxDefault') : t('chromeDefault')} />
                </SettingsSection>

                <SettingsSection title={t('lighting')}>
                  <RangeSetting label={t('exposure')} display={(settings.exposure * 10000).toFixed(0)} min="0.0001" max="0.01" step="0.0001" {...bind('exposure')} />
                  <RangeSetting label={t('renderDistance')} display={renderDistance} min="20" max="1000" step="10" value={renderDistance} onChange={setRenderDistance} />
                  <RangeSetting label={t('ambient')} display={settings.ambient} min="0" max="100" step="1" {...bind('ambient')} />
                  <RangeSetting label={t('directional')} display={settings.directional.toFixed(2)} min="0" max="200" step="0.1" {...bind('directional')} />
                </SettingsSection>

                <SettingsSection title={t('materials')}>
                  <RangeSetting label={t('roughness')} display={settings.roughness.toFixed(2)} min="0" max="1" step="0.05" {...bind('roughness')} hint={t('higherLessShiny')} />
                  <RangeSetting label={t('metalness')} display={settings.metalness.toFixed(2)} min="0.001" max="5" step="0.001" {...bind('metalness')} hint={t('lowerLessReflective')} />
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setSettings(DEFAULT_SETTINGS)}>
                    {t('resetAll')}
                  </Button>
                </SettingsSection>

                <div className="sm:hidden mt-4 pt-3 border-t space-y-2">
                  <div className="text-xs font-semibold mb-2">{t('toggles')}</div>
                  {toggles.map((toggle, index) => (
                    <Button key={index} size="sm" variant="outline" className="w-full text-xs justify-start" onClick={toggle.onClick}>
                      {toggle.mobileLabel ?? toggle.label}
                    </Button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="model-info" className="border-border/50">
              <AccordionTrigger className="text-sm">{t('modelInfo')}</AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-2 text-xs">
                  <InfoRow label={t('resolution')} className="capitalize">{modelMetadata.res_type}</InfoRow>
                  <InfoRow label={t('fileSize')}>{formatFileSize(modelMetadata.file_size)}</InfoRow>
                  <InfoRow label={t('credit')} className="text-right">{modelMetadata.credit}</InfoRow>
                  <InfoRow label={t('uploadedBy')}>{modelMetadata.uploader_name}</InfoRow>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {showControlsHelp && controlHelp[controlMode] && (
          <div className="absolute top-12 sm:top-4 left-2 sm:left-4 z-10 p-2 sm:p-3 bg-background/95 backdrop-blur rounded-lg border shadow-lg max-w-[10rem] sm:max-w-xs">
            <div className="text-[10px] sm:text-xs font-semibold mb-2">{controlHelp[controlMode][0]}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground space-y-1">
              {controlHelp[controlMode][1].map(([key, action], index) => (
                <div key={index}><span className="font-medium">{key}</span> {action}</div>
              ))}
              <div className="hidden sm:block"><span className="font-medium">F:</span> {t('toggleFullscreen')}</div>
              {controlMode !== 'orbit' && (
                <div className="hidden sm:block"><span className="font-medium">ESC:</span> {t('unlockMouse')}</div>
              )}
            </div>
          </div>
        )}

        <Canvas
          camera={{ position: [10, 10, 10], fov: 50 }}
          gl={{
            outputColorSpace: SRGBColorSpace,
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: settings.exposure,
          }}
        >
          <color attach="background" args={[dark ? '#0a0a0a' : '#f5f5f5']} />

          <ambientLight intensity={settings.ambient} />
          <directionalLight position={[10, 10, 5]} intensity={settings.directional} castShadow />

          <Suspense fallback={<LoadingFallback processingState={{ phase: 'downloading', progress: 0 }} />}>
            <Model
              modelMetadata={modelMetadata}
              roughness={settings.roughness}
              metalness={settings.metalness}
              useBBoxCulling={useBBoxCulling}
              renderDistance={renderDistance}
            />
          </Suspense>

          {controlMode === 'orbit' && <OrbitControls enableDamping dampingFactor={0.05} minDistance={1} maxDistance={100} />}
          {controlMode !== 'orbit' && <CustomPointerLockControls sensitivity={settings.mouseSensitivity} />}
          <FlyControls speed={moveSpeed} enabled={controlMode === 'fly'} />
          <WalkControls speed={moveSpeed} enabled={controlMode === 'walk'} onStateChange={setPlayerState} />

          <Grid
            infiniteGrid
            fadeDistance={50}
            cellColor={dark ? '#404040' : '#e0e0e0'}
            sectionColor={dark ? '#606060' : '#c0c0c0'}
          />

          {showStats && <Stats />}
        </Canvas>
      </div>
    </ErrorBoundary>
  )
}
