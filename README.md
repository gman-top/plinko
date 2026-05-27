# Plinko Gone Wild

A premium, cinematic, playable Plinko casino game — **dark luxury gold theme**, real physics, 5 special ball types, cinematic slow-mo moments, big-win celebrations.

## 🎮 Play live

**[https://gman-top.github.io/plinko/](https://gman-top.github.io/plinko/)**

> If the link 404s, open the repo's **Settings → Pages** and set source to **GitHub Actions** (or **Deploy from branch → `main` → `/ (root)`**). The included workflow at `.github/workflows/pages.yml` will then auto-deploy on every push.

Keyboard shortcuts: **SPACE** drop ball · **I** info · **F** features · **ESC** close modal.

## 🎨 Design source (Figma)

[GAMES UX/UI · Plinko Gone Wild](https://www.figma.com/design/008gDVj6FuoTuk3USADJb8/GAMES-UX-UI?node-id=1588-11)

The design system + 10 polished 1920×1080 frames live **below** the original artwork on the same Figma page (so the original is untouched as a reference).

## What's in this repo

- **`index.html`** — the live, playable Plinko game (single-file, vanilla JS + HTML5 Canvas + CSS)
- **`design-preview/`** — full-res PNGs of every Figma frame
- **`.github/workflows/pages.yml`** — GitHub Pages deploy workflow

## Gameplay features

- Real Plinko physics (gravity + peg collisions + sub-stepped integration)
- 5 ball types — Gold, Wild, Multiplier, Respin, Jackpot
- 3 risk levels × 5 row counts (8/10/12/14/16) with real Stake-style multiplier tables (×0.2 → ×1000)
- 3 toggleable Wild Features (Multipliers, Respin Chance, Multi-Ball Chance) that change spawn rates, slot payouts, and peg behavior
- Manual & Auto modes
- Live balance, wager, ROI, biggest-win tracking
- 10-row history table with payout color coding
- Cinematic slow-mo banner when a special ball spawns
- Particle bursts on peg hits & ball lands
- Screen shake on big wins
- Pulsing target slot + projected-payout HUD while a ball is in play
- Big Win overlay (×5+ payouts) with gold rays, multiplier chip, claim/continue CTAs
- Onboarding tutorial carousel on first visit
- Premium info modal (5 sections: ABOUT · HOW TO PLAY · FEATURES · RESULTS · RTP & FAIRNESS)
- Feature modal with adjusted-cost-per-ball summary
- Synthesized Web Audio peg/win sounds (off by default — toggle with the ♪ button)
- Fully responsive — scales to any viewport while preserving 16:9 pixel-perfect layout

## Frames delivered (Figma)

Ten 1920×1080 frames + a full component/design-system sheet:

| # | Frame | Preview |
|---|---|---|
| 01 | Tutorial — Multipliers | `design-preview/01-tutorial-multipliers.png` |
| 02 | Tutorial — Respin Chance | `design-preview/02-tutorial-respin.png` |
| 03 | Tutorial — Multi-Ball Chance | `design-preview/03-tutorial-multi-ball.png` |
| 04 | Main Game — Idle | `design-preview/04-main-game-idle.png` |
| 05 | Main Game — Ball Falling | `design-preview/05-ball-falling.png` |
| 06 | Special Ball — Cinematic Zoom | `design-preview/06-special-ball-cinematic.png` |
| 07 | Big Win State | `design-preview/07-big-win.png` |
| 08 | Feature Modal | `design-preview/08-feature-modal.png` |
| 09 | Info Screen | `design-preview/09-info-screen.png` |
| 10 | Component Library / Design System | `design-preview/10-design-system.png` |

## Visual direction

- **Dark luxury gold** palette — `#050404` deep black backgrounds, layered with warm gold (`#C9962B`, `#F2C75C`, `#FFE08A`) and cream highlights
- **Premium glass panels** with thin gold borders, inner highlights, soft outer glows
- **Cinematic spotlight vignettes** behind the board, with floating gold particles
- **Glowing pegs** as halos+core for depth
- **Multiplier slot color hierarchy:** gold (low/safe) → wild orange (mid) → jackpot red (center ×128)
- **Special-ball signature colors:** Wild = orange/red, Multiplier = purple, Respin = blue, Jackpot = red-gold

## Key design decisions

- **Board first, UI second** — the Plinko board is the largest element. Stats and bet controls sit in 304px-wide glass panels on either side.
- **Cinematic moments** for each special ball: dim + radial spotlight + zoomed dispenser + charging halo + slow-mo banner.
- **Ball-falling state** uses a zigzag trail with fading dots + connecting streak lines, a peg-impact flash with expanding rings + side sparks, and a target-slot pulse to show projected landing.
- **Big Win** uses a centered card with corner ornaments, radial gold rays, confetti particles, and a jackpot multiplier chip.
- **Feature Modal** stacks three feature cards (Multipliers, Respin Chance, Multi-Ball Chance) with icon orb, cost chips, toggle, and a footer showing adjusted cost per ball.
- **Info Screen** uses a 5-section tabbed layout: ABOUT · HOW TO PLAY · FEATURES · RESULTS · RTP & FAIRNESS, with the 4-step onboarding row and a Provably Fair / RTP card.

## Component system

Built from scratch in Figma — see frame **10 · Design System — Components** for the full sheet:

- 5 ball variants (Gold, Wild, Multiplier, Respin, Jackpot) with aura, gradient core, highlight, icon
- Primary / secondary / icon-circle / ghost / stepper buttons
- Toggle switches in 5 accent colors
- 3-segment selector control
- Multiplier slots in 7 multiplier tiers
- Glass panels: Stats Panel, Feature Card, History Row
- Typography scale (Display 44 → Heading 24 → Label 14 → Body 13)
- Full color token set with hex values

## Motion intent (documented in the static frames)

The static frames are designed to imply specific motion:
- Ball trail dots → motion blur trail
- Expanding rings on peg impact → ripple animation
- Target slot pulse → projection glow that strengthens as ball approaches
- Cinematic zoom → animated dispenser scale-in with particle burst
- Big Win rays → radiating beam sweep
- Light sweep on Play button → repeating shine
- Feature toggle glow → animates in/out on state change

## Source file structure

Inside the Figma file at the bottom of the canvas (below the original frames):

```
— PLINKO GONE WILD · CINEMATIC REDESIGN —     (banner)

[01 Tutorial Mult]  [02 Tutorial Respin]  [03 Tutorial Multi-Ball]
[04 Main Idle]      [05 Ball Falling]      [06 Cinematic Zoom]
[07 Big Win]        [08 Feature Modal]     [09 Info Screen]

10 · Design System — Components             (full-width strip)
```
