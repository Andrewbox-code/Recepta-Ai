import { describe, expect, it } from 'vitest'
import { scoreName, starsFor, suggestClub, waterDrop, relText } from '../src/game/round'
import { CLUBS } from '../src/physics/clubs'
import { Progress } from '../src/game/progress'

const stock: Record<string, number> = { dr: 264, '3w': 256, '5w': 244, '3h': 233, '4i': 219, '5i': 205, '6i': 191, '7i': 174, '8i': 157, '9i': 138, pw: 127, gw: 112, sw: 100, lw: 85 }
const yd = (y: number) => y * 0.9144

describe('round rules', () => {
  it('names scores', () => {
    expect(scoreName(1, 3)).toBe('Hole in One!')
    expect(scoreName(3, 5)).toBe('Eagle')
    expect(scoreName(3, 4)).toBe('Birdie')
    expect(scoreName(4, 4)).toBe('Par')
    expect(scoreName(6, 4)).toBe('Double Bogey')
    expect(relText(0)).toBe('E')
    expect(relText(-2)).toBe('-2')
  })

  it('awards stars', () => {
    expect(starsFor(18, 16)).toBe(1)
    expect(starsFor(16, 16)).toBe(2)
    expect(starsFor(14, 16)).toBe(3)
  })

  it('suggests a sensible club', () => {
    expect(suggestClub(CLUBS, stock, yd(390), 'fairway', true, 4).id).toBe('dr')
    expect(suggestClub(CLUBS, stock, yd(170), 'fairway', false, 4).id).toBe('7i')
    expect(suggestClub(CLUBS, stock, yd(60), 'fairway', false, 4).id).toBe('lw')
    expect(suggestClub(CLUBS, stock, yd(240), 'sand', false, 5).wood).toBe(false)
    expect(suggestClub(CLUBS, stock, yd(20), 'green', false, 4).putter).toBe(true)
    expect(suggestClub(CLUBS, stock, yd(165), 'fairway', true, 3).id).toBe('7i')
  })

  it('drops next to where the ball went into the water, on dry land', () => {
    const surf = (_x: number, z: number) => (z < -100 && z > -120 ? ('water' as const) : ('fairway' as const))
    const pts = [0, -50, -99, -105, -110].map((z, i) => ({ t: i, p: { x: 0, y: 0, z }, spin: 0, phase: 0 as const }))
    const d = waterDrop(pts, surf, { x: 0, z: 0 })
    expect(surf(d.x, d.z)).toBe('fairway')
    expect(d.z).toBeGreaterThan(-100)
    expect(d.z).toBeLessThan(-90)
  })

  it('records rounds, stars and unlocks', () => {
    const m = new Map<string, string>()
    const p = new Progress({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) })
    expect(p.courseUnlocked(1)).toBe(false)
    const r = p.recordRound('pinecrest', 17, 16)
    expect(r.stars).toBe(1)
    expect(r.chest).toBe('bronze')
    expect(p.courseUnlocked(1)).toBe(true)
    p.recordRound('pinecrest', 15, 16)
    expect(p.courses.pinecrest.stars).toBe(2)
    expect(p.courses.pinecrest.best).toBe(-1)
  })
})
