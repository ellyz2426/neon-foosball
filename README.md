# 🏓 Neon Foosball VR

A neon-soaked VR foosball game built with [IWSDK](https://iwsdk.dev) (Immersive Web SDK). Play in your browser or in VR — full table football with AI opponents, power-ups, achievements, and holodeck environments.

**▶️ [Play Now](https://ellyz2426.github.io/neon-foosball/)**

## Features

### Core Gameplay
- **4 rods per side** — Goalkeeper, Defense, Midfield, Attack
- **Custom ball physics** — realistic bouncing, friction, spin mechanics
- **Ball spin system** — off-center hits add lateral spin with curve trajectory
- **8 game modes** — Quick, Classic, Timed, Tournament, Daily Challenge, Survival, Speed, Practice
- **3 difficulty levels** — Easy, Medium, Hard with AI speed scaling
- **4 AI personality types** — Aggressive, Defensive, Balanced, Reactive (randomized per match)

### Progression
- **90 achievements** spanning goals, wins, combos, power-ups, rallies, modes, and milestones
- **XP / Level system** — 50 levels with 10 named titles (Rookie → GOAT)
- **8 unlockable table skins** — earned through gameplay milestones
- **Star rating** — 1-5 stars per match based on performance
- **Career stats** — games, wins, goals, accuracy, saves, play time, streaks
- **Leaderboard** — top 20 personal best matches

### Power-Ups
Six power-ups spawn as glowing orbs on the table:
- 🟠 **Big Ball** — Ball doubles in size
- 🟢 **Speed Boost** — Ball moves faster
- 🔵 **Freeze AI** — AI rods stop moving
- 🟣 **Magnet** — Ball curves toward your rods
- 🟡 **Shield** — Blocks your goal temporarily
- 🔴 **Power Kick** — Double kick force

### Visual Polish
- **5 holodeck themes** with live runtime switching
- **Goal nets** — neon wireframe with shimmer animation
- **Scoreboard hologram** above the table
- **Ball glow** scales with speed
- **Ball shadow** on table surface
- **Ball spin indicator** ring (color-coded by spin direction)
- **Ball trail** — 12-segment fading trail + speed trail particles
- **Wall bounce flash** effects
- **Table surface glow** — dynamic light pool following the ball
- **Electric arcs** between goal posts
- **Table legs** with neon glow rings + pulsing animation
- **Rod handle grips** (cylinder + knob)
- **Goal post neon lights** with pulsing animation
- **Collision spark particles** (team-colored)
- **Victory/defeat jingles** + celebration confetti
- **Camera shake** on goals and power kicks
- **Slow-motion** on match-winning goals
- **Victory lap** — table rotation on win
- **Ambient holodeck particles** — floating sparkle dust
- **Commentary system** — contextual toast messages
- **150-particle pool** for all effects

### Audio
- 15+ procedural Web Audio SFX (kicks, hits, walls, goals, saves, power-ups, combos, achievements)
- Rod sliding sound
- Wall bounce sound
- Victory/defeat jingles
- Ambient drone music

### Controls

| Action | Browser | VR |
|--------|---------|-----|
| Select rod | 1-4 keys | A button cycles |
| Slide rod | A/D or Arrows | Left thumbstick |
| Kick | Space | Right trigger |
| Pause | Esc / P | B button |
| Rematch | R (on game over) | — |

### Technical
- Built with **IWSDK 0.4.1** (Immersive Web SDK)
- **16 PanelUI spatial panels**, zero HTML DOM overlays
- **Dual runtime** — VR + browser with automatic adaptation
- **2,750+ lines** of TypeScript
- **Seeded daily challenges** — same challenge for everyone each day (mulberry32 PRNG)
- **localStorage persistence** — stats, achievements, and settings saved locally

## Development

\`\`\`bash
npm install
npm run dev     # Start dev server on :5173
npm run build   # Production build to dist/
\`\`\`

Requires Node.js >= 20.19.0.

## License

Built as part of the [IWSDK Daily Builds](https://github.com/ellyz2426) project.
