import type { SurfaceId } from '../physics/lies'

// Everything the renderer, the ball physics and the game need to know about a
// playable piece of ground: the driving range or a single course hole.

export interface Pin {
  x: number
  z: number
  color: string
  r: number // green radius, for signage
  label?: string
  kind: 'target' | 'practice' | 'hole'
}

export interface Water {
  x: number
  z: number
  rx: number
  rz: number
  rot: number
  level: number
}

export interface Bounds {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface TreeSpot {
  x: number
  z: number
  s: number
  pine: number // chance it's a conifer rather than a hardwood
  far: boolean // can be skipped in Performance mode
}

export interface Layout {
  kind: 'range' | 'hole'
  bounds: Bounds
  tee: { x: number; z: number }
  pins: Pin[]
  water: Water[]
  heightAt(x: number, z: number): number
  surfaceAt(x: number, z: number): SurfaceId
  groundY(x: number, z: number): number
  outOfBounds(x: number, z: number): boolean
  treeSpots(rnd: () => number): TreeSpot[]
  // Ground colour for the painted terrain texture, 0xRRGGBB. The range paints
  // itself with canvas drawing instead.
  paintColor?(x: number, z: number): number
}
