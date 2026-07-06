# Neon Foosball VR

A neon-holographic table football game built with IWSDK for WebXR and browser play.

## Features

- **Full foosball mechanics** — 4 rods per side (GK, DEF, MID, ATK), ball physics with realistic collisions, slide + kick controls
- **8 game modes** — Quick Match, Classic, Timed, Tournament, Daily Challenge, Survival, Speed, Practice
- **3 difficulty levels** — Easy, Medium, Hard with AI speed scaling
- **40 achievements** — milestones for goals, wins, combos, streaks, shutouts, and more
- **8 table skins** — gameplay-gated unlocks with neon color themes
- **5 holodeck themes** — Neon Holodeck, Crimson Arena, Toxic Neon, Ultra Violet, Solar Blaze
- **XP/Level progression** — 10 title ranks from Rookie to GOAT
- **Leaderboard** — top 20 scores with mode and accuracy tracking
- **Career stats** — comprehensive lifetime statistics
- **16 PanelUI spatial panels** — fully spatial UI, zero HTML overlays
- **Audio engine** — procedural SFX (kick, hit, wall, goal, achievement) + ambient drone
- **150-particle pool** — goal celebration effects with physics
- **Dual runtime** — VR headset + browser with full keyboard/controller support

## Controls

### Keyboard
- **1-4** — Select rod (GK, DEF, MID, ATK)
- **A/D or ←/→** — Slide selected rod
- **Space** — Kick
- **P/Esc** — Pause

### XR Controllers
- **Left thumbstick** — Slide selected rod
- **A button** — Cycle rod selection
- **Right trigger** — Kick
- **B button** — Pause

## Built With

- [IWSDK](https://iwsdk.dev) (Immersive Web SDK) v0.4.1
- PanelUI with uikitml spatial UI system
- Three.js (super-three) + EliCS ECS

## Play

[Play Neon Foosball VR](https://ellyz2426.github.io/neon-foosball/)
