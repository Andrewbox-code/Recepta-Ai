# Pure Strike: driving range prototype

"Pure Strike" is a working title. The name only appears in `index.html`, the HUD brand line, and `package.json`.

This is the first vertical slice: **swing input and ball physics on a driving range**. There's no course or career mode yet. The aim is to get the swing feeling right first.

**What's on the range:**
- a full 15-club bag, from driver to putter
- target greens guarded by bunkers
- a pond in front of the 145
- a practice putting green beside the tee

- **Stack:** Three.js + TypeScript + Vite. No game engine and no loaded assets. All sound is synthesised with WebAudio and all textures are drawn to canvases, so the prototype stays small and quick to iterate on.
- **Look:**
  - a physically based sky with drifting clouds, which also lights the scene
  - a sun that casts soft shadows
  - sculpted terrain: raised greens, sunken bunkers with lips, mounds and distant hills
  - dense instanced grass that bends in the wind
  - leaf-card trees
  - a reflective pond
  - a clearcoat, dimpled ball
- **Graphics setting:** Settings → Graphics switches between **High** and **Performance**. Performance turns off real-time shadows and the grass blades, and is the default on small touch screens.
- **Runs:** in desktop browsers (mouse or trackpad) and on phones and tablets (touch).

```bash
cd golf
npm install
npm run dev      # http://localhost:5173
npm test         # physics calibration + swing-analysis tests
npm run build    # static build in golf/dist
```

## How to swing

Press and hold anywhere on the range, then:

1. **Pull down** to take the club back. The tick marks show half and full backswing depth.
2. **Push up through the ball.** The dashed line through the spot where you pressed is the ball.
3. **Keep going.** Swing *through* the ball and don't stop at it.

If you let go before reaching the ball, you've backed off and nothing happens.

There's no power bar and no timing meter. Everything comes from the motion itself.

| What you do | What it becomes |
|---|---|
| How fast your hands are moving as they cross the ball | Clubhead speed. The calibration is in Settings. |
| The direction of the stroke on the way into the ball (up-right or up-left) | **Club path**: in-to-out or out-to-in |
| Whether the stroke curls left or holds off to the right *through* impact (the release) | **Face angle** relative to the path. The face also partly follows the path on its own, so a straight in-to-out swing draws and a straight out-to-in swing fades. Curling left through impact turns it into a hook, and holding off turns it into a slice. |
| Where along the stroke your speed peaked | **Low point / strike.** Peaking before the ball (casting, or quitting on it) hits it **fat**. Still accelerating well past the ball catches it **thin**. Peaking at the ball hits it **pure**. |
| How far left or right of your press point you cross the ball line | Heel or toe strike. Gear effect curves the woods back. Way off the heel is a **shank**, and missing entirely is a whiff. |
| Backswing time vs downswing time, and how abruptly the downswing starts | **Tempo and composure.** About 3:1 is ideal. Snatching from the top, rushing, or swinging past 100% adds scatter to face and path and throws the club over the top. A smooth swing is close to repeatable. |

**How you find out what happened.** Strike quality is never shown as a grade. You read it from:

- the ball flight and the launch numbers
- the sound: pure iron click, driver crack, stinging thin, dull fat thud, sand splash, rough rip, hosel clank
- the turf: divots, sand, dust, grass clippings
- screen shake and phone vibration on mishits
- slow motion on flushed shots and disasters

**Swing Lab** (press `L`) is an opt-in diagnostic overlay for tuning. It shows your hand path colour-coded by speed, where the speed peaked, the club path and face arrows, and the raw numbers: tempo, ramp, path, face, low point in mm, and strike location.

### Controls

| Key | Action |
|---|---|
| `Z` / `X`, `[` / `]`, or mouse wheel | Previous / next club |
| `1`–`0` | Jump to the first ten clubs (DR … 9i) |
| `N` | New putt (putter only) |
| `Q` / `E` or arrow keys | Aim left or right |
| `L` | Swing Lab |
| `V` | Camera style: low ball-chase or down-the-line |
| `W` | New wind |
| `M` | Mute |
| `Space` / click | Skip the ball flight, or re-tee |

Settings has:

- **swing-speed calibration.** Set it so your natural full swing reads about 95%.
- **turf firmness**
- **wind strength**
- **camera style**

## The bag

| Club | Stock carry |
|---|---|
| DR | 264 yd |
| 3W | 256 yd |
| 5W | 244 yd |
| 3H | 233 yd |
| 4i | 219 yd |
| 5i | 205 yd |
| 6i | 191 yd |
| 7i | 174 yd |
| 8i | 157 yd |
| 9i | 138 yd |
| PW | 127 yd |
| GW | 112 yd |
| SW | 100 yd |
| LW | 85 yd |

These are pure strikes in calm air. The club selector shows each club's loft and stock carry.

**Picking a club:** use the carousel at the bottom of the screen, the chip strip above it, the mouse wheel, or the keys.

**Putting:** choosing the **Putter** moves you to the practice green. You get a random putt 3–14 m from the cup, and the aim starts pointed at the hole.
- The same swing gesture works, but only speed control and start line matter.
- Toe or heel contact comes up short.
- Hole it and you get a new putt.

## Ball physics (`src/physics`)

**Launch.** `impact.ts` turns swing metrics, club, and lie into ball speed, launch angle, start direction, spin rate, and spin-axis tilt.

**Lies** change contact differently:

- **Rough** adds a flier: less spin, more randomness, and it punishes fat contact.
- **A fairway bunker** punishes anything fat hard.
- **Hardpan** gives no bounce forgiveness and slightly more spin.
- **A tee** turns fat into a skied pop-up.

The ball visibly sits differently in each lie. Changing lie triggers a close-up camera so you can see it.

**Flight.** `flight.ts` integrates the flight at 240 Hz and models:

- drag and Magnus lift, both driven by spin ratio
- spin decay
- **wind with a log height profile**, so a low punch really does cheat the wind and a high wedge gets pushed around

**Landing.** Bounces use an impulse model with surface friction. Backspin fights forward speed at the contact patch, so wedges check up on greens while drivers release on a firm fairway. Surfaces (fairway, fringe, green, rough, sand, water) and the firmness setting change bounce, grab, and roll-out. A ball that lands or rolls into the pond is gone.

**Course shape:** `src/world/layout.ts` defines the shape of the course (heights and surfaces). Both the renderer and the ball physics read it, so the ball lands on exactly what you see.

**Calibration.** `test/tuning.test.ts` checks pure-strike carries against real launch-monitor windows for a player with about 108 mph driver speed:

| Club | Carry |
|---|---|
| Driver | 264 yd |
| 7 iron | 174 yd |
| Sand wedge | 100 yd |

Run `npm run tune` to print the carry table.

## Reading the wind

- **Flags** on every target green stream downwind. They hang limp in calm air and stand out stiff when it blows.
- **A windsock** by the tee fills out as the wind picks up.
- **Trees** lean and sway with the wind.
- **Seed fluff** drifts past the camera at the wind's speed.
- **Ambient wind noise** gets louder with it.
- **The compass arrow** (top right) points relative to your target line.

Gusts in the flight simulation run on the same clock as the flags, so what you see is what the ball gets.

## Camera and feel

The camera works like this:

1. Down-the-line view at address.
2. It holds for a beat at launch.
3. A low chase camera trails the ball, sitting below it and off to the side of its line.
4. For any shot with real hang time, it cuts to a camera waiting near the landing spot.
5. It drifts toward the ball as it settles.

A pured shot, or a shank, chunk, top, or whiff, drops into slow motion for a moment.

The gallery reacts to proximity (an "ooh", or applause for a close one, or a big cheer for a hole-out). A shank gets a groan.

## Code map

```
src/swing/analyze.ts      gesture -> tempo, speed, path, face, release point, strike offset (pure, tested)
src/swing/SwingInput.ts   pointer capture (coalesced events), live phase detection
src/physics/impact.ts     swing + club + lie -> launch conditions & contact type
src/physics/flight.ts     flight / bounce / roll simulation, wind model
src/physics/clubs.ts      club table
src/physics/lies.ts       lies (contact) and surfaces (landing)
src/world/layout.ts       course shape: heights + surfaces, shared by renderer and physics
src/world/*               terrain, sky, trees, grass, range dressing, ball + lie patches, debris, tracer, wind drift
src/camera/*              camera director
src/audio/*               synthesised audio
src/ui/SwingOverlay.ts    on-screen hand path
```

The tuning constants for the gesture-to-club mapping are in `TUNING` in `impact.ts`:

- angle gain
- how much the face follows the path
- ideal tempo
- release-to-mm scale
- toe mm per unit

Those constants, together with the `speedRef` calibration, are the main levers for feel.

## Next steps, once the swing feels right

1. One fully playable hole with real risk/reward: a dogleg, a water carry, a bunker-guarded green with a false front, plus putting.
2. More holes, then a career loop with club upgrades earned from performance, a live leaderboard, and a "clutch putt to make the cut" moment.
3. A ghost replay of your best round.
