import type { Club } from '../physics/clubs'
import type { FlightPoint } from '../physics/flight'
import type { LieId, SurfaceId } from '../physics/lies'

// Rules-of-golf bits of a round, kept free of rendering so they can be tested.

export function scoreName(strokes: number, par: number) {
  if (strokes === 1) return 'Hole in One!'
  const d = strokes - par
  if (d <= -3) return 'Albatross'
  if (d === -2) return 'Eagle'
  if (d === -1) return 'Birdie'
  if (d === 0) return 'Par'
  if (d === 1) return 'Bogey'
  if (d === 2) return 'Double Bogey'
  if (d === 3) return 'Triple Bogey'
  return `+${d}`
}

export const relText = (d: number) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`)

// 1 star for finishing, 2 for par or better, 3 for two under or better.
export function starsFor(strokes: number, par: number) {
  return strokes <= par - 2 ? 3 : strokes <= par ? 2 : 1
}

export function lieFromSurface(s: SurfaceId): LieId {
  if (s === 'green') return 'green'
  if (s === 'sand') return 'sand'
  if (s === 'rough') return 'rough'
  return 'fairway'
}

// Pick a sensible club for the distance (metres) and lie.
export function suggestClub(clubs: Club[], stockYds: Record<string, number>, distM: number, lie: LieId, teeShot: boolean, par: number): Club {
  if (lie === 'green') return clubs.find((c) => c.putter)!
  const yd = distM / 0.9144
  const allowed = clubs.filter((c) => {
    if (c.putter) return false
    if (c.id === 'dr') return teeShot
    if (lie === 'sand' && c.wood) return false
    if (lie === 'rough' && (c.id === '3w' || c.id === '5w')) return false
    return true
  })
  if (teeShot && par >= 4) {
    const dr = allowed.find((c) => c.id === 'dr')
    if (dr && yd > (stockYds.dr ?? 250) * 0.8) return dr
  }
  // Longest-first: take the first club whose stock carry reaches.
  const sorted = [...allowed].sort((a, b) => (stockYds[b.id] ?? 0) - (stockYds[a.id] ?? 0))
  let pick = sorted[0]
  for (const c of sorted) {
    if ((stockYds[c.id] ?? 0) >= yd * 0.97) pick = c
    else break
  }
  return pick
}

// Where to drop after finding water: the last dry point on the flight path
// before it entered, pulled back a couple of metres toward where it came from.
export function waterDrop(points: FlightPoint[], surfaceAt: (x: number, z: number) => SurfaceId, from: { x: number; z: number }) {
  let i = points.length - 1
  while (i > 0 && surfaceAt(points[i].p.x, points[i].p.z) === 'water') i--
  const p = points[Math.max(0, i)].p
  const dx = from.x - p.x
  const dz = from.z - p.z
  const l = Math.hypot(dx, dz) || 1
  const k = Math.min(2.5, l)
  let x = p.x + (dx / l) * k
  let z = p.z + (dz / l) * k
  // Keep stepping back until dry.
  for (let n = 0; n < 60 && surfaceAt(x, z) === 'water'; n++) {
    x += (dx / l) * 1.5
    z += (dz / l) * 1.5
  }
  return { x, z }
}
