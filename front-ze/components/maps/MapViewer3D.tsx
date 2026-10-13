"use client"

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, Grid, Stats, useProgress, Html } from '@react-three/drei'
import { useTheme } from 'next-themes'
import { Suspense, useState, useRef, useEffect } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Button } from 'components/ui/button'
import { Vector3, Raycaster, SRGBColorSpace, ACESFilmicToneMapping, Box3, Euler } from 'three'
import { DRACOLoader } from 'three-stdlib'
import { Maximize, Minimize } from 'lucide-react'
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "components/ui/accordion.tsx"
import { traverseSceneChunked } from 'utils/sceneProcessing'
import { getCachedModelData, cacheModelData } from 'utils/modelCache'
import { Map3DModel } from 'types/maps'
import { useTranslations } from 'next-intl'

const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox')
const formatFileSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

interface MapViewer3DProps {
  mapName: string
  resType: 'high' | 'low'
  modelMetadata: Map3DModel
}

interface ProcessingState {
  phase: 'downloading' | 'parsing' | 'validating' | 'optimizing' | 'ready'
  progress: number
  isReady: boolean
}

const setupDracoLoader = () => {
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  dracoLoader.setDecoderConfig({ type: 'wasm' })
  dracoLoader.setWorkerLimit(8)
  dracoLoader.preload()
  return dracoLoader
}


function Model({
  mapName,
  resType: _resType,
  modelMetadata,
  roughness,
  metalness,
  useBBoxCulling,
  renderDistance
}: {
  mapName: string
  resType: 'high' | 'low'
  modelMetadata: Map3DModel
  roughness: number
  metalness: number
  renderDistance: number
  useBBoxCulling: boolean
}) {
  const modelUrl = modelMetadata.link_path
  const gltf = useGLTF(modelUrl, true, true, (loader) => {
    const dracoLoader = setupDracoLoader()
    loader.setDRACOLoader(dracoLoader)
  })

  const scene = gltf.scene

  const [processingState, setProcessingState] = useState<ProcessingState>({
    phase: 'parsing',
    progress: 0,
    isReady: false
  })

  useEffect(() => {
    if (!scene) return

    async function validateScene() {
      setProcessingState({ phase: 'validating', progress: 0, isReady: false })

      const cached = await getCachedModelData(modelUrl)

      const objectsToRemove: number[] = []
      let meshCount = 0
      let skimMeshCount = 0
      let skimMeshCountRemoved = 0
      let materialIssues = 0
      let geometryIssues = 0
      let lodCount = 0
      let spriteCount = 0
      let removedObjects = 0
      let dracoCompressedCount = 0

      if (cached) {
        console.log(`Using cached validation for ${mapName}`)

        let traversalIndex = 0
        const objectsToRemoveFromParent: any[] = []

        scene.traverse(child => {
          if (cached.objectsToRemove.includes(traversalIndex)) {
            objectsToRemoveFromParent.push(child)
          }
          traversalIndex++
        })

        objectsToRemoveFromParent.forEach(child => {
          if (child.parent) {
            child.parent.remove(child)
            removedObjects++
          }
        })

        if (removedObjects > 0) {
          console.warn(`⚠ Removed ${removedObjects} problematic objects from cache`)
        }

        meshCount = cached.meshCount
        dracoCompressedCount = cached.dracoMeshCount
      } else {
        console.log('Map:', mapName)
        console.log('Scene:', scene)
        console.log('GLTF loaded with Draco compression support')

        let traversalIndex = 0
        const problematicObjects: any[] = []

        await traverseSceneChunked(scene, (child: any) => {
          const currentIndex = traversalIndex
          traversalIndex++

          if (!child) {
            objectsToRemove.push(currentIndex)
            problematicObjects.push(child)
            return
          }

          if (child.isSkinnedMesh) {
            skimMeshCount++
            if (!child.skeleton) {
              skimMeshCountRemoved++
              objectsToRemove.push(currentIndex)
              problematicObjects.push(child)
            }
          }
          if (child.isLOD || child.type === 'LOD') {
            lodCount++
            console.warn('⚠ LOD object found:', child.name || 'unnamed', 'Removing to prevent update errors')
            objectsToRemove.push(currentIndex)
            problematicObjects.push(child)
            return
          }

          if (child.isSprite || child.type === 'Sprite') {
            spriteCount++
            if (!child.material) {
              console.warn('⚠ Sprite without material:', child.name || 'unnamed', 'Removing')
              objectsToRemove.push(currentIndex)
              problematicObjects.push(child)
              return
            }
          }

          if (child.isMesh) {
            meshCount++

            if (child.geometry && child.geometry.attributes && child.geometry.userData?.draco) {
              dracoCompressedCount++
            }

            if (!child.material) {
              materialIssues++
              console.warn('⚠ Mesh without material:', child.name || 'unnamed', 'Removing')
              objectsToRemove.push(currentIndex)
              problematicObjects.push(child)
              return
            }
            if (!child.geometry) {
              geometryIssues++
              console.warn('⚠ Mesh without geometry:', child.name || 'unnamed', 'Removing')
              objectsToRemove.push(currentIndex)
              problematicObjects.push(child)
              return
            }

            if (Array.isArray(child.material)) {
              const validMaterials = child.material.filter((mat: any) => mat !== undefined && mat !== null)
              if (validMaterials.length !== child.material.length) {
                console.warn(`⚠ Mesh has undefined materials:`, child.name || 'unnamed')
                child.material = validMaterials
              }
              if (validMaterials.length === 0) {
                console.warn('⚠ Mesh has no valid materials, removing:', child.name || 'unnamed')
                objectsToRemove.push(currentIndex)
                problematicObjects.push(child)
                return
              }
            }
          }
        }, {
          chunkSize: 50,
          onProgress: (progress) => {
            setProcessingState(prev => ({ ...prev, progress }))
          }
        })

        problematicObjects.forEach(child => {
          if (child && child.parent) {
            child.parent.remove(child)
            removedObjects++
          }
        })

        await cacheModelData(modelUrl, {
          modelUrl,
          objectsToRemove,
          meshCount,
          dracoMeshCount: dracoCompressedCount
        })

        console.log(`Total meshes: ${meshCount}`)
        console.log(`Draco compressed meshes: ${dracoCompressedCount}`)
        console.log(`Total skim mesh: ${skimMeshCount}`)
        console.log(`Total skim mesh removed: ${skimMeshCountRemoved}`)
        console.log(`LOD objects: ${lodCount}`)
        console.log(`Sprite objects: ${spriteCount}`)
        if (removedObjects > 0) console.warn(`Removed ${removedObjects} problematic objects`)
        if (materialIssues > 0) console.error(`Material issues: ${materialIssues}`)
        if (geometryIssues > 0) console.error(`Geometry issues: ${geometryIssues}`)
        console.log('======================')
      }

      setProcessingState({ phase: 'optimizing', progress: 0, isReady: false })
    }

    validateScene()
  }, [scene, mapName, modelUrl])

  useEffect(() => {
    if (!scene || processingState.phase !== 'optimizing') return

    async function optimizeMaterials() {
      setProcessingState({ phase: 'ready', progress: 0, isReady: true })

      const materials: any[] = []
      scene.traverse((child) => {
        if ((child as any).isMesh) {
          const mesh = child as any
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          materials.push(...mats)
        }
      })

      for (let i = 0; i < materials.length; i += 10) {
        await new Promise<void>(resolve => {
          const processChunk = () => {
            const chunk = materials.slice(i, i + 10)
            chunk.forEach(mat => {
              if (!mat) return

              try {
                if (mat.map) {
                  mat.map.colorSpace = SRGBColorSpace
                }
                if (mat.emissiveMap) {
                  mat.emissiveMap.colorSpace = SRGBColorSpace
                }
                if (mat.metalness !== undefined) {
                  mat.metalness = metalness
                }
                if (mat.roughness !== undefined) {
                  mat.roughness = roughness
                }
                mat.needsUpdate = true
              } catch (err) {
                console.warn('Error updating material:', err, mat)
              }
            })
            resolve()
          }

          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(processChunk, { timeout: 50 })
          } else {
            setTimeout(processChunk, 0)
          }
        })
      }

      console.log('Material optimization complete')
    }

    optimizeMaterials()
  }, [scene, processingState.phase, roughness, metalness])

  useEffect(() => {
    if (!scene || !processingState.isReady) return

    scene.traverse((child: any) => {
      if (!child) return

      if (child.isLOD) {
        if (!child.levels || !Array.isArray(child.levels)) {
          child.levels = []
          console.warn('Fixed LOD with missing levels:', child.name)
        }
      }

      if (child.isSprite) {
        if (!child.material) {
          child.visible = false
          console.warn('Hidden Sprite with missing material:', child.name)
        }
      }

      if (child.isLight && child.shadow) {
        if (!child.shadow.camera) {
          console.warn('Light has shadow but no shadow camera:', child.name)
          child.castShadow = false
        }
      }

      if (child.children) {
        child.children = child.children.filter((c: any) => c !== undefined && c !== null)
      }
    })

    const onBeforeRender = () => {
      scene.traverse((child: any) => {
        if (!child) return

        if (child.isMesh) {
          if (!child.geometry) {
            child.visible = false
            return
          }
          if (!child.material) {
            child.visible = false
            return
          }
        }

        if (child.isSprite && !child.material) {
          child.visible = false
        }

        if (child.isLOD && (!child.levels || child.levels.length === 0)) {
          child.visible = false
        }
      })
    }

    scene.onBeforeRender = onBeforeRender

    return () => {
      scene.onBeforeRender = null
    }
  }, [scene, processingState.isReady])

  useFrame(({ camera }) => {
    if (!processingState.isReady) return

    const cameraPos = camera.position

    scene.traverse((child: any) => {
      if (!child || !child.isMesh) return

      let distance: number

      if (useBBoxCulling) {
        if (!child.userData.boundingBox) {
          child.userData.boundingBox = new Box3().setFromObject(child)
        }
        distance = child.userData.boundingBox.distanceToPoint(cameraPos)
      } else {
        distance = cameraPos.distanceTo(child.position)
      }

      if (child.userData.originalVisible === undefined) {
        child.userData.originalVisible = child.visible
      }

      if (distance > renderDistance) {
        child.visible = false
      } else {
        child.visible = child.userData.originalVisible
      }
    })
  })

  if (!processingState.isReady) {
    return <LoadingFallback mapName={mapName} processingState={processingState} modelMetadata={modelMetadata} />
  }

  return <primitive object={scene} />
}

function LoadingFallback({
  mapName: _mapName,
  processingState,
  modelMetadata
}: {
  mapName: string
  processingState: ProcessingState
  modelMetadata?: Map3DModel
}) {
  const t = useTranslations('maps.viewer3d')
  const phase = processingState.phase
  const processingProgress = processingState.progress
  const { active, progress: downloadProgress, loaded, total } = useProgress()

  const isDownloading = active || !phase
  const currentPhase = isDownloading ? t('phaseDownloading') :
                      phase === 'parsing' ? t('phaseParsing') :
                      phase === 'validating' ? t('phaseValidating') :
                      phase === 'optimizing' ? t('phaseOptimizing') : t('phaseReady')

  const currentProgress = isDownloading ? Math.round(downloadProgress) : Math.round(processingProgress || 0)

  return (
    <Html center>
      <div className="flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-6 rounded-lg min-w-64">
        <div className="text-lg font-medium text-foreground mb-2">
          {currentPhase}
        </div>
        <div className="text-sm text-muted-foreground">
          {isDownloading
            ? t('downloadProgress', {loaded, total, percent: currentProgress})
            : t('percentComplete', {percent: currentProgress})
          }
        </div>
        <div className="w-48 h-2 bg-secondary rounded-full mt-4 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
        {modelMetadata && (
          <div className="mt-4 pt-4 border-t border-border/50 w-full">
            <div className="text-xs text-muted-foreground space-y-1">
              {modelMetadata.credit && (
                <div>{t('modelBy', {credit: modelMetadata.credit})}</div>
              )}
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

function ErrorFallback({ error, mapName: _mapName }: { error: Error; mapName: string }) {
  const t = useTranslations('maps.viewer3d')
  const isDracoError = error.message.includes('draco') || error.message.includes('Draco')

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <h3 className="text-lg font-semibold mb-2">{t('failedToLoadModel')}</h3>
      <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
        <p className="font-mono">{t('noModelYet')}</p>
        {isDracoError && (
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

      const movementX = event.movementX || 0
      const movementY = event.movementY || 0

      euler.current.setFromQuaternion(camera.quaternion)
      euler.current.y -= movementX * 0.002 * sensitivity
      euler.current.x -= movementY * 0.002 * sensitivity
      euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x))
      camera.quaternion.setFromEuler(euler.current)
    }

    const handlePointerLockChange = () => {
      isLockedRef.current = document.pointerLockElement === gl.domElement
    }

    const handleClick = () => {
      if (!isLockedRef.current) {
        gl.domElement.requestPointerLock()
      }
    }

    gl.domElement.addEventListener('click', handleClick)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('pointerlockchange', handlePointerLockChange)

    return () => {
      gl.domElement.removeEventListener('click', handleClick)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
    }
  }, [camera, gl, sensitivity])

  return null
}

function FlyControls({ speed, enabled }: { speed: number; enabled: boolean }) {
  const { camera } = useThree()
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
  })

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']

      if (gameKeys.includes(e.code)) {
        e.preventDefault()
        e.stopPropagation()
      }

      if (e.ctrlKey && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      switch (e.code) {
        case 'KeyW':
          moveState.current.forward = true
          break
        case 'KeyS':
          moveState.current.backward = true
          break
        case 'KeyA':
          moveState.current.left = true
          break
        case 'KeyD':
          moveState.current.right = true
          break
        case 'Space':
          moveState.current.up = true
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          moveState.current.down = true
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']

      if (gameKeys.includes(e.code)) {
        e.preventDefault()
        e.stopPropagation()
      }

      switch (e.code) {
        case 'KeyW':
          moveState.current.forward = false
          break
        case 'KeyS':
          moveState.current.backward = false
          break
        case 'KeyA':
          moveState.current.left = false
          break
        case 'KeyD':
          moveState.current.right = false
          break
        case 'Space':
          moveState.current.up = false
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          moveState.current.down = false
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [enabled])

  useFrame((_, delta) => {
    if (!enabled) return

    const velocity = new Vector3()
    const direction = new Vector3()

    camera.getWorldDirection(direction)

    const right = new Vector3()
    right.crossVectors(camera.up, direction).normalize()

    if (moveState.current.forward) velocity.add(direction)
    if (moveState.current.backward) velocity.sub(direction)
    if (moveState.current.left) velocity.add(right)
    if (moveState.current.right) velocity.sub(right)
    if (moveState.current.up) velocity.y += 1
    if (moveState.current.down) velocity.y -= 1

    if (velocity.length() > 0) {
      velocity.normalize().multiplyScalar(speed * delta)
      camera.position.add(velocity)
    }
  })

  return null
}

function WalkControls({
  speed,
  enabled,
  onStateChange,
}: {
  speed: number
  enabled: boolean
  onStateChange?: (state: { isOnGround: boolean; isCrouching: boolean; isSprinting: boolean; isOnLadder: boolean }) => void
}) {
  const { camera, scene } = useThree()
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
  })

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

  const PLAYER_HEIGHT = 1.3
  const CROUCH_HEIGHT = 0.9
  const GRAVITY = -20
  const JUMP_FORCE = 8
  const WALK_SPEED = 5
  const SPRINT_MULTIPLIER = 1.8
  const CROUCH_MULTIPLIER = 0.5
  const LADDER_CLIMB_SPEED = 3

  useEffect(() => {
    if (!enabled) return

    const raycaster = new Raycaster()
    const downVector = new Vector3(0, -1, 0)
    raycaster.set(camera.position, downVector)
    const intersects = raycaster.intersectObjects(scene.children, true)

    if (intersects.length > 0) {
      const groundY = intersects[0].point.y
      camera.position.y = groundY + PLAYER_HEIGHT
    } else {
      const upVector = new Vector3(0, 1, 0)
      raycaster.set(camera.position, upVector)
      const upIntersects = raycaster.intersectObjects(scene.children, true)

      if (upIntersects.length > 0) {
        const groundY = upIntersects[0].point.y
        camera.position.y = groundY + PLAYER_HEIGHT
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC']

      if (gameKeys.includes(e.code)) {
        e.preventDefault()
        e.stopPropagation()
      }

      switch (e.code) {
        case 'KeyW':
          moveState.current.forward = true
          break
        case 'KeyS':
          moveState.current.backward = true
          break
        case 'KeyA':
          moveState.current.left = true
          break
        case 'KeyD':
          moveState.current.right = true
          break
        case 'Space':
          if (playerState.current.isOnLadder) {
            // Jump off ladder
            playerState.current.isOnLadder = false
            playerState.current.velocity.y = JUMP_FORCE
          } else if (playerState.current.isOnGround && !playerState.current.isCrouching) {
            playerState.current.velocity.y = JUMP_FORCE
          }
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          moveState.current.sprint = true
          break
        case 'KeyC':
          moveState.current.crouch = true
          playerState.current.isCrouching = true
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC']

      if (gameKeys.includes(e.code)) {
        e.preventDefault()
        e.stopPropagation()
      }

      switch (e.code) {
        case 'KeyW':
          moveState.current.forward = false
          break
        case 'KeyS':
          moveState.current.backward = false
          break
        case 'KeyA':
          moveState.current.left = false
          break
        case 'KeyD':
          moveState.current.right = false
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          moveState.current.sprint = false
          break
        case 'KeyC':
          moveState.current.crouch = false
          playerState.current.isCrouching = false
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [camera, enabled])

  useFrame((state, delta) => {
    if (!enabled) return

    const raycaster = new Raycaster()
    const downVector = new Vector3(0, -1, 0)
    const frameCount = state.clock.elapsedTime * 60 // Approximate frame number

    const shouldRaycast = Math.floor(frameCount) !== raycastCache.current.frame

    if (shouldRaycast) {
      raycastCache.current.frame = Math.floor(frameCount)

      // Ladder detection - check in front of player
      const forwardDir = new Vector3()
      camera.getWorldDirection(forwardDir)
      forwardDir.y = 0
      forwardDir.normalize()

      const ladderRaycaster = new Raycaster()
      ladderRaycaster.set(camera.position, forwardDir)
      ladderRaycaster.far = 0.8 // Check 0.8 units in front
      const ladderIntersects = ladderRaycaster.intersectObjects(scene.children, true)

      raycastCache.current.ladderCheck.isNearLadder = ladderIntersects.some((hit) => {
        const obj = hit.object
        return (
          obj.name.toLowerCase().includes('ladder') ||
          obj.parent?.name.toLowerCase().includes('ladder') ||
          obj.userData?.isLadder === true
        )
      })

      raycaster.set(camera.position, downVector)
      const intersects = raycaster.intersectObjects(scene.children, true)

      const groundDistance = intersects.length > 0 ? intersects[0].distance : Infinity
      const groundY = intersects.length > 0 ? intersects[0].point.y : 0

      raycastCache.current.groundCheck = {
        isOnGround: groundDistance < (playerState.current.isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT) + 0.1,
        distance: groundDistance,
        groundY: groundY,
      }
    }

    const isNearLadder = raycastCache.current.ladderCheck.isNearLadder
    const targetHeight = playerState.current.isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT

    if (isNearLadder && moveState.current.forward && !playerState.current.isOnLadder) {
      playerState.current.isOnLadder = true
      playerState.current.velocity.y = 0
    }

    // Dismount ladder if:
    // 1. Moving backward
    // 2. No longer near a ladder (moved away sideways)
    if (playerState.current.isOnLadder) {
      if (moveState.current.backward || !isNearLadder) {
        playerState.current.isOnLadder = false
      }
    }

    playerState.current.isOnGround = raycastCache.current.groundCheck.isOnGround

    // Handle gravity and ground snapping
    if (playerState.current.isOnLadder) {
      // On ladder - no gravity, allow vertical movement
      playerState.current.velocity.y = 0

      // Dismount if reached ground
      if (playerState.current.isOnGround && moveState.current.backward) {
        playerState.current.isOnLadder = false
      }
    } else if (playerState.current.isOnGround) {
      const groundY = raycastCache.current.groundCheck.groundY

      // Snap to ground if:
      // 1. Just landed (velocity.y < 0)
      // 2. Crouch state changed (targetHeight changed)
      // 3. Ground height changed (walking on slope)
      const heightChanged = Math.abs(targetHeight - playerState.current.previousTargetHeight) > 0.01
      const groundChanged = Math.abs(groundY - playerState.current.previousGroundY) > 0.01

      if (playerState.current.velocity.y < 0 || heightChanged || groundChanged) {
        playerState.current.velocity.y = 0
        camera.position.y = groundY + targetHeight
        playerState.current.previousGroundY = groundY
        playerState.current.previousTargetHeight = targetHeight
      }
    } else {
      // In the air - apply gravity
      playerState.current.velocity.y += GRAVITY * delta
    }

    const direction = new Vector3()
    camera.getWorldDirection(direction)
    direction.y = 0
    direction.normalize()

    const right = new Vector3()
    right.crossVectors(new Vector3(0, 1, 0), direction).normalize()

    const movement = new Vector3()

    // Different movement on ladder
    if (playerState.current.isOnLadder) {
      // On ladder: W/S = up/down, A/D = left/right
      if (moveState.current.forward) movement.y += 1
      if (moveState.current.backward) movement.y -= 1
      if (moveState.current.left) movement.add(right.clone().multiplyScalar(0.5))
      if (moveState.current.right) movement.sub(right.clone().multiplyScalar(0.5))

      if (movement.length() > 0) {
        movement.normalize()
        movement.multiplyScalar(LADDER_CLIMB_SPEED * speed * delta)

        // Apply movement directly on ladder (no collision detection)
        camera.position.add(movement)
      }
    } else {
      // Normal movement
      if (moveState.current.forward) movement.add(direction)
      if (moveState.current.backward) movement.sub(direction)
      if (moveState.current.left) movement.add(right)
      if (moveState.current.right) movement.sub(right)

      if (movement.length() > 0) {
        movement.normalize()

        let currentSpeed = WALK_SPEED * speed
        if (moveState.current.sprint && !playerState.current.isCrouching) {
          currentSpeed *= SPRINT_MULTIPLIER
        } else if (playerState.current.isCrouching) {
          currentSpeed *= CROUCH_MULTIPLIER
        }

        movement.multiplyScalar(currentSpeed * delta)

        let canMove = true
        let hitLadder = false

        if (movement.length() > 0.01) {
          const PLAYER_RADIUS = 0.3
          const COLLISION_DISTANCE = 0.6

          // Test fewer points for better performance (reduced from 3x4 to 2x2)
          const heights = [0.2, targetHeight * 0.6]
          const testAngles = [0, Math.PI / 2] // Just forward and sideways

          const movementDirection = movement.clone().normalize()

          // Check collisions at different heights and angles around the player
          for (const height of heights) {
            for (const angle of testAngles) {
              const offset = new Vector3(
                Math.cos(angle) * PLAYER_RADIUS,
                height,
                Math.sin(angle) * PLAYER_RADIUS
              )

              const testPos = camera.position.clone().add(offset)
              raycaster.set(testPos, movementDirection)
              raycaster.far = COLLISION_DISTANCE
              const collisions = raycaster.intersectObjects(scene.children, true)

              if (collisions.length > 0 && collisions[0].distance < COLLISION_DISTANCE) {
                // Check if we hit a ladder
                const obj = collisions[0].object
                const isLadder =
                  obj.name.toLowerCase().includes('ladder') ||
                  obj.parent?.name.toLowerCase().includes('ladder') ||
                  obj.userData?.isLadder === true

                if (isLadder) {
                  hitLadder = true
                  // Don't block movement into ladders - let player walk through to attach
                } else {
                  // Hit a non-ladder object - block movement
                  canMove = false
                  break
                }
              }
            }
            if (!canMove) break
          }
        }

        // If we walked into a ladder, attach to it
        if (hitLadder && moveState.current.forward && !playerState.current.isOnLadder) {
          playerState.current.isOnLadder = true
          playerState.current.velocity.y = 0
        }

        if (canMove) {
          camera.position.x += movement.x
          camera.position.z += movement.z
        }
      }
    }

    // Apply vertical velocity (except when on ladder, which handles Y directly)
    if (!playerState.current.isOnLadder) {
      camera.position.y += playerState.current.velocity.y * delta
    }

    onStateChange?.({
      isOnGround: playerState.current.isOnGround,
      isCrouching: playerState.current.isCrouching,
      isSprinting: moveState.current.sprint && !playerState.current.isCrouching,
      isOnLadder: playerState.current.isOnLadder,
    })
  })

  return null
}

function SpeedIndicator({ speed, mode, playerState }: {
  speed: number
  mode: string
  playerState?: { isOnGround: boolean; isCrouching: boolean; isSprinting: boolean; isOnLadder?: boolean }
}) {
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
            <div className="flex items-center gap-2 text-xs text-purple-500">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              {t('onLadder')}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${playerState.isOnGround ? 'bg-green-500' : 'bg-red-500'}`} />
              {playerState.isOnGround ? t('onGround') : t('inAir')}
            </div>
          )}
          {playerState.isCrouching && (
            <div className="flex items-center gap-2 text-xs text-yellow-500">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              {t('crouching')}
            </div>
          )}
          {playerState.isSprinting && !playerState.isCrouching && (
            <div className="flex items-center gap-2 text-xs text-blue-500">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              {t('sprinting')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type ControlMode = 'orbit' | 'fly' | 'walk'

export default function MapViewer3D({ mapName, resType, modelMetadata }: MapViewer3DProps) {
  const t = useTranslations('maps.viewer3d')
  const { theme } = useTheme()
  const [showStats, setShowStats] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [controlMode, setControlMode] = useState<ControlMode>('orbit')
  const [moveSpeed, setMoveSpeed] = useState(10)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [ambientIntensity, setAmbientIntensity] = useState(100)
  const [directionalIntensity, setDirectionalIntensity] = useState(0.5)
  const [materialRoughness, setMaterialRoughness] = useState(0.7)
  const [materialMetalness, setMaterialMetalness] = useState(0.1)
  const [toneMapExposure, setToneMapExposure] = useState(.007)
  const [useBBoxCulling, setUseBBoxCulling] = useState(true)
  const [renderDistance, setRenderDistance] = useState(300)
  const [showControlsHelp, setShowControlsHelp] = useState(true)
  const [mouseSensitivity, setMouseSensitivity] = useState(isFirefox ? 3.5 : 1.0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playerState, setPlayerState] = useState({
    isOnGround: true,
    isCrouching: false,
    isSprinting: false,
  })

  useEffect(() => {
    const originalError = console.error
    console.error = (...args: any[]) => {
      if (typeof args[0] === 'string' && args[0].includes('The user has exited the lock before this request was completed')) {
        // Suppress SecurityError
        return
      }
      originalError.apply(console, args)
    }
    return () => {
      console.error = originalError
    }
  }, [])

  const handleControlModeChange = (mode: ControlMode) => {
    setControlMode(mode)

    // Exit pointer lock when switching to orbit mode
    if (mode === 'orbit' && document.pointerLockElement) {
      document.exitPointerLock()
    }

    if (mode === 'walk') {
      setMoveSpeed(1)
    } else if (mode === 'fly' && moveSpeed < 5) {
      setMoveSpeed(10)
    }
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
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          void toggleFullscreen()
        }
      }else if (e.key === 'F1'){
        handleControlModeChange('orbit')
        e.preventDefault()
      }else if (e.key === 'F2'){
        handleControlModeChange('fly')
        e.preventDefault()
      }else if (e.key === 'F3'){
        handleControlModeChange('walk')
        e.preventDefault()

      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('keydown', handleKeyPress)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [toggleFullscreen])

  useEffect(() => {
    switch(controlMode){
      case "fly":
        setRenderDistance(500)
        break;
      case "orbit":
        setRenderDistance(300)
        break;
      case "walk":
        setRenderDistance(90)
        break;
      default:
        setRenderDistance(300)
        break;
    }
    const handleWheel = (e: WheelEvent) => {
      // Only intercept scroll when pointer lock is active
      if (controlMode !== 'orbit' && document.pointerLockElement) {
        e.preventDefault()
        setMoveSpeed((prev) => {
          const newSpeed = prev + (e.deltaY > 0 ? -1 : 1)
          return Math.max(1, Math.min(100, newSpeed))
        })
      }
    }

    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [controlMode])

  return (
    <ErrorBoundary
      fallbackRender={({ error }) => <ErrorFallback error={error} mapName={mapName} />}
    >
      <div ref={containerRef} className="w-full h-full relative">
        <div className="absolute top-2 sm:top-4 right-2 sm:right-4 z-10 flex gap-1 sm:gap-2 flex-wrap justify-end max-w-[calc(100%-1rem)] sm:max-w-none">
          <Button
            size="sm"
            className="text-xs sm:text-sm px-2 sm:px-3"
            variant={controlMode === 'orbit' ? 'default' : 'secondary'}
            onClick={() => handleControlModeChange('orbit')}
          >
            {t('orbit')}<span className="hidden sm:inline"> (F1)</span>
          </Button>
          <Button
            size="sm"
            className="text-xs sm:text-sm px-2 sm:px-3"
            variant={controlMode === 'fly' ? 'default' : 'secondary'}
            onClick={() => handleControlModeChange('fly')}
          >
            {t('noclip')}<span className="hidden sm:inline"> (F2)</span>
          </Button>
          <Button
            size="sm"
            className="text-xs sm:text-sm px-2 sm:px-3"
            variant={controlMode === 'walk' ? 'default' : 'secondary'}
            onClick={() => handleControlModeChange('walk')}
          >
            {t('walkMode')}<span className="hidden sm:inline"> (F3)</span>
          </Button>
          <Button
            size="sm"
            className="hidden sm:inline-flex text-xs sm:text-sm px-2 sm:px-3"
            variant="secondary"
            onClick={() => setShowControlsHelp(!showControlsHelp)}
          >
            {showControlsHelp ? t('hideControls') : t('showControls')}
          </Button>
          <Button
            size="sm"
            className="hidden sm:inline-flex"
            variant="secondary"
            onClick={() => setShowStats(!showStats)}
          >
            {showStats ? t('hideStats') : t('showStats')}
          </Button>
          <Button
            size="sm"
            className="hidden sm:inline-flex"
            variant="secondary"
            onClick={() => setWireframe(!wireframe)}
          >
            {t('wireframe')}
          </Button>
          <Button
            size="sm"
            className="hidden sm:inline-flex"
            variant="secondary"
            onClick={() => setUseBBoxCulling(!useBBoxCulling)}
            title={useBBoxCulling ? t('cullingBBoxTitle') : t('cullingCenterTitle')}
          >
            {t('culling', {mode: useBBoxCulling ? 'BBox' : 'Center'})}
          </Button>
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
          <SpeedIndicator
            speed={moveSpeed}
            mode={controlMode}
            playerState={controlMode === 'walk' ? playerState : undefined}
          />
        )}

        <div className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 px-2 z-10 bg-background/70 backdrop-blur rounded-lg border shadow-lg min-w-44 sm:min-w-60 max-h-[60vh] sm:max-h-[80vh] overflow-y-auto">
          <Accordion
              type="single"
              collapsible
              className="max-w-lg"
          ><AccordionItem value="options">
            <AccordionTrigger>{t('settings')}</AccordionTrigger>
            <AccordionContent>

              <div className="text-xs font-semibold mb-3">{t('controls')}</div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-muted-foreground">{t('mouseSensitivity')}</label>
                    <span className="text-xs font-mono">{mouseSensitivity.toFixed(2)}x</span>
                  </div>
                  <input
                      type="range"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={mouseSensitivity}
                      onChange={(e) => setMouseSensitivity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {isFirefox ? t('firefoxDefault') : t('chromeDefault')}
                  </div>
                </div>
              </div>

              <div className="text-xs font-semibold mb-3 mt-4 pt-3 border-t">{t('lighting')}</div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-muted-foreground">{t('exposure')}</label>
                    <span className="text-xs font-mono">{(toneMapExposure * 10000).toFixed(0)}</span>
                  </div>
                  <input
                      type="range"
                      min="0.0001"
                      max="0.01"
                      step="0.0001"
                      value={toneMapExposure}
                      onChange={(e) => setToneMapExposure(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-muted-foreground">{t('renderDistance')}</label>
                    <span className="text-xs font-mono">{renderDistance}</span>
                  </div>
                  <input
                      type="range"
                      min="20"
                      max="1000"
                      step="10"
                      value={renderDistance}
                      onChange={(e) => setRenderDistance(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-muted-foreground">{t('ambient')}</label>
                    <span className="text-xs font-mono">{ambientIntensity}</span>
                  </div>
                  <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={ambientIntensity}
                      onChange={(e) => setAmbientIntensity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-muted-foreground">{t('directional')}</label>
                    <span className="text-xs font-mono">{directionalIntensity.toFixed(2)}</span>
                  </div>
                  <input
                      type="range"
                      min="0"
                      max="200"
                      step="0.1"
                      value={directionalIntensity}
                      onChange={(e) => setDirectionalIntensity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>

              <div className="text-xs font-semibold mb-3 mt-4 pt-3 border-t">{t('materials')}</div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-muted-foreground">{t('roughness')}</label>
                    <span className="text-xs font-mono">{materialRoughness.toFixed(2)}</span>
                  </div>
                  <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={materialRoughness}
                      onChange={(e) => setMaterialRoughness(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {t('higherLessShiny')}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-muted-foreground">{t('metalness')}</label>
                    <span className="text-xs font-mono">{materialMetalness.toFixed(2)}</span>
                  </div>
                  <input
                      type="range"
                      min="0.001"
                      max="5"
                      step="0.001"
                      value={materialMetalness}
                      onChange={(e) => setMaterialMetalness(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {t('lowerLessReflective')}
                  </div>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => {
                      setMouseSensitivity(isFirefox ? 3.5 : 1.0 )
                      setToneMapExposure(.007)
                      setAmbientIntensity(100)
                      setDirectionalIntensity(0.5)
                      setMaterialRoughness(0.7)
                      setMaterialMetalness(0.1)
                    }}
                >
                  {t('resetAll')}
                </Button>
              </div>

              <div className="sm:hidden mt-4 pt-3 border-t space-y-2">
                <div className="text-xs font-semibold mb-2">{t('toggles')}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs justify-start"
                  onClick={() => setShowControlsHelp(!showControlsHelp)}
                >
                  {showControlsHelp ? t('hideControlsHelp') : t('showControlsHelp')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs justify-start"
                  onClick={() => setShowStats(!showStats)}
                >
                  {showStats ? t('hideStats') : t('showStats')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs justify-start"
                  onClick={() => setWireframe(!wireframe)}
                >
                  {t('wireframeToggle', {state: wireframe ? t('on') : t('off')})}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs justify-start"
                  onClick={() => setUseBBoxCulling(!useBBoxCulling)}
                >
                  {t('culling', {mode: useBBoxCulling ? 'BBox' : 'Center'})}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="model-info" className="border-border/50">
            <AccordionTrigger className="text-sm">
              {t('modelInfo')}
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('resolution')}</span>
                  <span className="capitalize">{modelMetadata.res_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('fileSize')}</span>
                  <span>{formatFileSize(modelMetadata.file_size)}</span>
                </div>
                {modelMetadata.credit && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('credit')}</span>
                    <span className="text-right">{modelMetadata.credit}</span>
                  </div>
                )}
                {modelMetadata.uploader_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('uploadedBy')}</span>
                    <span>{modelMetadata.uploader_name}</span>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          </Accordion>

        </div>

        {showControlsHelp && controlMode === 'orbit' && (
          <div className="absolute top-12 sm:top-4 left-2 sm:left-4 z-10 p-2 sm:p-3 bg-background/95 backdrop-blur rounded-lg border shadow-lg max-w-[10rem] sm:max-w-xs">
            <div className="text-[10px] sm:text-xs font-semibold mb-2">{t('orbitControls')}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground space-y-1">
              <div><span className="font-medium">{t('leftMouse')}</span> {t('rotate')}</div>
              <div><span className="font-medium">{t('rightMouse')}</span> {t('pan')}</div>
              <div><span className="font-medium">{t('scroll')}</span> {t('zoom')}</div>
              <div className="hidden sm:block"><span className="font-medium">F:</span> {t('toggleFullscreen')}</div>
            </div>
          </div>
        )}
        {showControlsHelp && controlMode === 'fly' && (
          <div className="absolute top-12 sm:top-4 left-2 sm:left-4 z-10 p-2 sm:p-3 bg-background/95 backdrop-blur rounded-lg border shadow-lg max-w-[10rem] sm:max-w-xs">
            <div className="text-[10px] sm:text-xs font-semibold mb-2">{t('flyControls')}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground space-y-1">
              <div><span className="font-medium">WASD:</span> {t('move')}</div>
              <div><span className="font-medium">{t('space')}</span> {t('up')}</div>
              <div><span className="font-medium">Shift:</span> {t('down')}</div>
              <div><span className="font-medium">{t('mouse')}</span> {t('lookAround')}</div>
              <div><span className="font-medium">{t('scroll')}</span> {t('speedLabel')}</div>
              <div className="hidden sm:block"><span className="font-medium">F:</span> {t('toggleFullscreen')}</div>
              <div className="hidden sm:block"><span className="font-medium">ESC:</span> {t('unlockMouse')}</div>
            </div>
          </div>
        )}
        {showControlsHelp && controlMode === 'walk' && (
          <div className="absolute top-12 sm:top-4 left-2 sm:left-4 z-10 p-2 sm:p-3 bg-background/95 backdrop-blur rounded-lg border shadow-lg max-w-[10rem] sm:max-w-xs">
            <div className="text-[10px] sm:text-xs font-semibold mb-2">{t('walkControls')}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground space-y-1">
              <div><span className="font-medium">WASD:</span> {t('walkAction')}</div>
              <div><span className="font-medium">{t('space')}</span> {t('jump')}</div>
              <div><span className="font-medium">Shift:</span> {t('sprint')}</div>
              <div><span className="font-medium">C:</span> {t('crouch')}</div>
              <div><span className="font-medium">{t('mouse')}</span> {t('lookAround')}</div>
              <div><span className="font-medium">{t('scroll')}</span> {t('speedLabel')}</div>
              <div className="hidden sm:block"><span className="font-medium">F:</span> {t('toggleFullscreen')}</div>
              <div className="hidden sm:block"><span className="font-medium">ESC:</span> {t('unlockMouse')}</div>
            </div>
          </div>
        )}

        <Canvas
          camera={{ position: [10, 10, 10], fov: 50 }}
          gl={{
            outputColorSpace: SRGBColorSpace,
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: toneMapExposure,
          }}
        >
          <color attach="background" args={[theme === 'dark' ? '#0a0a0a' : '#f5f5f5']} />

          <ambientLight intensity={ambientIntensity} />
          <directionalLight position={[10, 10, 5]} intensity={directionalIntensity} castShadow />

          <Suspense fallback={<LoadingFallback mapName={mapName} processingState={{ phase: 'downloading', progress: 0, isReady: false }} />}>
            <Model
              mapName={mapName}
              resType={resType}
              modelMetadata={modelMetadata}
              roughness={materialRoughness}
              metalness={materialMetalness}
              useBBoxCulling={useBBoxCulling}
              renderDistance={renderDistance}
            />
          </Suspense>

          {controlMode === 'orbit' && (
            <OrbitControls
              enableDamping
              dampingFactor={0.05}
              minDistance={1}
              maxDistance={100}
            />
          )}
          {controlMode !== 'orbit' && <CustomPointerLockControls sensitivity={mouseSensitivity} />}
          <FlyControls speed={moveSpeed} enabled={controlMode === 'fly'} />
          <WalkControls speed={moveSpeed} enabled={controlMode === 'walk'} onStateChange={setPlayerState} />

          <Grid
            infiniteGrid
            fadeDistance={50}
            cellColor={theme === 'dark' ? '#404040' : '#e0e0e0'}
            sectionColor={theme === 'dark' ? '#606060' : '#c0c0c0'}
          />

          {showStats && <Stats />}
        </Canvas>
      </div>
    </ErrorBoundary>
  )
}
