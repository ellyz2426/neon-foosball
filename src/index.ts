import {
  World,
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  Follower,
  ScreenSpace,
  InputComponent,
  eq,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  EdgesGeometry,
  LineSegments,
  Mesh,
  Group,
  Color,
  Vector3,
  PointLight,
  FogExp2,
  AmbientLight,
  DirectionalLight,
  TorusGeometry,
  AdditiveBlending,
  DoubleSide,
} from '@iwsdk/core';

// ========== TYPES & CONSTANTS ==========
type GameState = 'title' | 'modeselect' | 'difficulty' | 'playing' | 'paused' | 'countdown' | 'goal' | 'gameover' | 'leaderboard' | 'achievements' | 'settings' | 'help' | 'stats' | 'skins';
type GameMode = 'quick' | 'classic' | 'timed' | 'tournament' | 'daily' | 'survival' | 'speed' | 'practice';
type Difficulty = 'easy' | 'medium' | 'hard';

interface Rod {
  group: Group;
  players: Mesh[];
  zPos: number;
  slidePos: number; // -1 to 1 lateral position
  kickAngle: number; // rotation angle for kick
  kickSpeed: number; // current kick rotation speed
  playerCount: number;
  playerSpacing: number;
  isPlayer: boolean; // true = player's rod, false = AI
}

interface Achievement {
  id: string; name: string; desc: string; check: () => boolean;
}

interface LeaderEntry {
  score: string; mode: string; accuracy: string; date: string;
}

const TABLE_W = 3.6; // table width (x-axis)
const TABLE_L = 5.4; // table length (z-axis)
const TABLE_H = 0.1;
const WALL_H = 0.25;
const BALL_R = 0.04;
const PLAYER_R = 0.045;
const PLAYER_H = 0.18;
const ROD_R = 0.015;
const GOAL_W = 0.7;
const KICK_FORCE = 6.0;
const BALL_FRICTION = 0.985;
const BALL_MAX_SPEED = 8.0;

const THEMES = [
  { name: 'Neon Holodeck', table: '#001a2e', wall: '#003355', accent: '#00e5ff', player1: '#00ff88', player2: '#ff4444', ball: '#ffff00', grid: '#003344', glow: '#00e5ff', fog: '#000a14' },
  { name: 'Crimson Arena', table: '#2e0000', wall: '#550011', accent: '#ff4444', player1: '#ff8800', player2: '#ff00ff', ball: '#ffff44', grid: '#441111', glow: '#ff4444', fog: '#140000' },
  { name: 'Toxic Neon', table: '#0a2e00', wall: '#115500', accent: '#88ff00', player1: '#00ffcc', player2: '#ff4488', ball: '#ffff00', grid: '#224400', glow: '#88ff00', fog: '#041400' },
  { name: 'Ultra Violet', table: '#1a002e', wall: '#330055', accent: '#aa44ff', player1: '#ff44aa', player2: '#44aaff', ball: '#ffcc00', grid: '#221144', glow: '#aa44ff', fog: '#0a0014' },
  { name: 'Solar Blaze', table: '#2e1a00', wall: '#553300', accent: '#ff8800', player1: '#ffcc00', player2: '#ff4444', ball: '#ffffff', grid: '#442200', glow: '#ff8800', fog: '#140a00' },
];

const SKINS = [
  { name: 'Neon Cyan', color: '#00e5ff', unlock: 'Default' },
  { name: 'Solar Flare', color: '#ff4444', unlock: '10 wins' },
  { name: 'Plasma Pink', color: '#ff44ff', unlock: '50 goals' },
  { name: 'Frost Blue', color: '#00ccff', unlock: '25 games' },
  { name: 'Toxic Green', color: '#88ff00', unlock: '5 shutouts' },
  { name: 'Royal Gold', color: '#ffaa00', unlock: 'Win tournament' },
  { name: 'Void Purple', color: '#8800ff', unlock: 'x8 combo' },
  { name: 'Inferno', color: '#ff6600', unlock: '100 goals' },
];

// ========== POWER-UPS ==========
const POWER_UPS = [
  { id: 'big_ball', name: 'BIG BALL', color: 0xff8800, duration: 8, desc: 'Ball size doubles' },
  { id: 'speed_boost', name: 'SPEED UP', color: 0x00ff00, duration: 6, desc: 'Ball moves faster' },
  { id: 'freeze', name: 'FREEZE AI', color: 0x00ccff, duration: 5, desc: 'AI rods freeze' },
  { id: 'magnet', name: 'MAGNET', color: 0xff00ff, duration: 7, desc: 'Ball curves toward your rods' },
  { id: 'shield', name: 'SHIELD', color: 0xffff00, duration: 6, desc: 'Your goal is blocked' },
  { id: 'power_kick', name: 'POWER KICK', color: 0xff4444, duration: 10, desc: 'Double kick force' },
];

// ========== SEEDED PRNG (mulberry32) ==========
function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function dateSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// ========== AI PERSONALITIES ==========
const AI_PERSONALITIES = {
  aggressive: { slideSpeed: 1.3, kickRate: 0.5, forwardBias: 0.3, gkReaction: 0.8 },
  defensive: { slideSpeed: 1.0, kickRate: 0.25, forwardBias: -0.2, gkReaction: 1.5 },
  balanced: { slideSpeed: 1.1, kickRate: 0.35, forwardBias: 0, gkReaction: 1.0 },
  reactive: { slideSpeed: 1.2, kickRate: 0.4, forwardBias: 0.1, gkReaction: 1.2 },
};

// ========== GAME STATE MANAGER ==========
class GameStateManager {
  state: GameState = 'title';
  mode: GameMode = 'quick';
  difficulty: Difficulty = 'medium';
  themeIdx = 0;
  skinIdx = 0;
  playerScore = 0;
  aiScore = 0;
  timeLeft = 0;
  matchTime = 0;
  goalLimit = 5;
  selectedRod = 3; // 0=GK,1=DEF,2=MID,3=ATK
  combo = 0;
  comboTimer = 0;
  bestCombo = 0;
  shots = 0;
  saves = 0;
  goalsSinceLast = 0;
  countdownVal = 3;
  countdownTimer = 0;
  goalDisplayTimer = 0;
  tournamentRound = 0;
  tournamentWins = 0;
  survivalTime = 0;
  lastGoalTime = 0;

  // Ball state
  ballX = 0; ballZ = 0;
  ballVX = 0; ballVZ = 0;

  // Power-ups
  activePowerUp: string | null = null;
  powerUpTimer = 0;
  powerUpSpawnTimer = 0;
  powerUpX = 0;
  powerUpZ = 0;
  powerUpActive = false;
  shieldTimer = 0;
  bigBallActive = false;
  freezeAI = false;
  magnetActive = false;
  powerUpsCollected = 0;

  // AI personality (per match)
  aiPersonality: 'aggressive' | 'defensive' | 'balanced' | 'reactive' = 'balanced';

  // Ball trail
  ballTrailPositions: { x: number; z: number; age: number }[] = [];

  // Settings
  sfxVol = 80;
  musicVol = 60;

  // Persistence
  stats = {
    games: 0, wins: 0, losses: 0, totalGoals: 0, totalConceded: 0,
    bestCombo: 0, totalShots: 0, totalSaves: 0, playTime: 0,
    winStreak: 0, currentStreak: 0, shutouts: 0, modesPlayed: new Set<string>(),
    xp: 0, level: 1,
  };
  achievementsUnlocked = new Set<string>();
  leaderboard: LeaderEntry[] = [];
  skinUnlocked = new Set<number>([0]);
  achPage = 0;

  constructor() { this.load(); }

  get theme() { return THEMES[this.themeIdx]; }
  get goalTarget(): number {
    if (this.mode === 'quick') return 5;
    if (this.mode === 'classic') return 10;
    if (this.mode === 'survival') return 999;
    if (this.mode === 'timed') return 999;
    if (this.mode === 'tournament') return 5;
    if (this.mode === 'speed') return 5;
    return 999;
  }
  get aiSpeedMult(): number {
    if (this.difficulty === 'easy') return 0.5;
    if (this.difficulty === 'hard') return 1.5;
    return 1.0;
  }
  get ballSpeedMult(): number {
    let mult = this.mode === 'speed' ? 1.5 : 1.0;
    if (this.activePowerUp === 'speed_boost') mult *= 1.4;
    return mult;
  }
  get xpForLevel(): number { return 100 + this.stats.level * 50; }
  get levelTitle(): string {
    const titles = ['Rookie', 'Amateur', 'Contender', 'Skilled', 'Veteran', 'Expert', 'Master', 'Champion', 'Legend', 'GOAT'];
    return titles[Math.min(Math.floor((this.stats.level - 1) / 5), titles.length - 1)];
  }

  addXP(amount: number) {
    this.stats.xp += amount;
    while (this.stats.xp >= this.xpForLevel) {
      this.stats.xp -= this.xpForLevel;
      this.stats.level++;
    }
  }

  resetMatch() {
    this.playerScore = 0;
    this.aiScore = 0;
    this.matchTime = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.shots = 0;
    this.saves = 0;
    this.goalsSinceLast = 0;
    this.survivalTime = 0;
    this.lastGoalTime = 0;
    if (this.mode === 'timed') this.timeLeft = 180;
    // Power-up reset
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    this.powerUpSpawnTimer = 8 + Math.random() * 7;
    this.powerUpActive = false;
    this.shieldTimer = 0;
    this.bigBallActive = false;
    this.freezeAI = false;
    this.magnetActive = false;
    this.powerUpsCollected = 0;
    this.ballTrailPositions = [];
    // AI personality randomization
    const personalities: Array<'aggressive' | 'defensive' | 'balanced' | 'reactive'> = ['aggressive', 'defensive', 'balanced', 'reactive'];
    if (this.mode === 'daily') {
      const rng = mulberry32(dateSeed());
      this.aiPersonality = personalities[Math.floor(rng() * 4)];
    } else {
      this.aiPersonality = personalities[Math.floor(Math.random() * 4)];
    }
    this.resetBall();
  }

  resetBall() {
    this.ballX = 0;
    this.ballZ = 0;
    if (this.mode === 'daily') {
      const rng = mulberry32(dateSeed() + this.playerScore + this.aiScore);
      this.ballVX = (rng() - 0.5) * 2;
      this.ballVZ = (rng() > 0.5 ? 1 : -1) * 2;
    } else {
      this.ballVX = (Math.random() - 0.5) * 2;
      this.ballVZ = (Math.random() > 0.5 ? 1 : -1) * 2;
    }
  }

  save() {
    const data = {
      stats: { ...this.stats, modesPlayed: [...this.stats.modesPlayed] },
      achievements: [...this.achievementsUnlocked],
      leaderboard: this.leaderboard.slice(0, 20),
      skinUnlocked: [...this.skinUnlocked],
      skinIdx: this.skinIdx,
      themeIdx: this.themeIdx,
      sfxVol: this.sfxVol,
      musicVol: this.musicVol,
    };
    try { localStorage.setItem('neon-foosball-save', JSON.stringify(data)); } catch {}
  }

  load() {
    try {
      const raw = localStorage.getItem('neon-foosball-save');
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.stats) {
        Object.assign(this.stats, d.stats);
        this.stats.modesPlayed = new Set(d.stats.modesPlayed || []);
      }
      if (d.achievements) this.achievementsUnlocked = new Set(d.achievements);
      if (d.leaderboard) this.leaderboard = d.leaderboard;
      if (d.skinUnlocked) this.skinUnlocked = new Set(d.skinUnlocked);
      if (d.skinIdx != null) this.skinIdx = d.skinIdx;
      if (d.themeIdx != null) this.themeIdx = d.themeIdx;
      if (d.sfxVol != null) this.sfxVol = d.sfxVol;
      if (d.musicVol != null) this.musicVol = d.musicVol;
    } catch {}
  }
}

const GM = new GameStateManager();

// ========== ACHIEVEMENTS ==========
const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_goal', name: 'First Goal', desc: 'Score your first goal', check: () => GM.stats.totalGoals >= 1 },
  { id: 'hat_trick', name: 'Hat Trick', desc: 'Score 3 in one match', check: () => GM.playerScore >= 3 },
  { id: 'shutout', name: 'Shutout', desc: 'Win without conceding', check: () => GM.state === 'gameover' && GM.playerScore > GM.aiScore && GM.aiScore === 0 },
  { id: 'sniper', name: 'Sniper', desc: '50% shot accuracy', check: () => GM.shots > 0 && (GM.playerScore / GM.shots) >= 0.5 },
  { id: 'iron_wall', name: 'Iron Wall', desc: '10 saves in a game', check: () => GM.saves >= 10 },
  { id: 'speedster', name: 'Speedster', desc: 'Score in under 10s', check: () => GM.lastGoalTime < 10 && GM.lastGoalTime > 0 },
  { id: 'veteran', name: 'Veteran', desc: 'Play 10 games', check: () => GM.stats.games >= 10 },
  { id: 'champion', name: 'Champion', desc: 'Win 5 games', check: () => GM.stats.wins >= 5 },
  { id: 'streak3', name: 'Win Streak', desc: 'Win 3 in a row', check: () => GM.stats.currentStreak >= 3 },
  { id: 'combo5', name: 'Combo King', desc: 'Get x5 combo', check: () => GM.bestCombo >= 5 },
  { id: 'all_modes', name: 'All Modes', desc: 'Play every mode', check: () => GM.stats.modesPlayed.size >= 8 },
  { id: 'daily_done', name: 'Daily Player', desc: 'Complete a daily', check: () => GM.stats.modesPlayed.has('daily') },
  { id: 'tournament_w', name: 'Tournament Victor', desc: 'Win a tournament', check: () => GM.tournamentWins >= 4 },
  { id: 'survivor', name: 'Survivor', desc: 'Survive 5+ min', check: () => GM.survivalTime >= 300 },
  { id: 'goals_100', name: 'Century', desc: 'Score 100 total', check: () => GM.stats.totalGoals >= 100 },
  { id: 'goals_10', name: 'Scorer', desc: 'Score 10 total', check: () => GM.stats.totalGoals >= 10 },
  { id: 'goals_50', name: 'Striker', desc: 'Score 50 total', check: () => GM.stats.totalGoals >= 50 },
  { id: 'wins_10', name: 'Winner', desc: 'Win 10 games', check: () => GM.stats.wins >= 10 },
  { id: 'wins_25', name: 'Dominator', desc: 'Win 25 games', check: () => GM.stats.wins >= 25 },
  { id: 'combo8', name: 'Combo Master', desc: 'Get x8 combo', check: () => GM.bestCombo >= 8 },
  { id: 'combo10', name: 'Combo Legend', desc: 'Get x10 combo', check: () => GM.bestCombo >= 10 },
  { id: 'saves_50', name: 'Goalkeeper', desc: '50 total saves', check: () => GM.stats.totalSaves >= 50 },
  { id: 'streak5', name: 'Hot Streak', desc: 'Win 5 in a row', check: () => GM.stats.currentStreak >= 5 },
  { id: 'games_25', name: 'Regular', desc: 'Play 25 games', check: () => GM.stats.games >= 25 },
  { id: 'games_50', name: 'Dedicated', desc: 'Play 50 games', check: () => GM.stats.games >= 50 },
  { id: 'games_100', name: 'Addict', desc: 'Play 100 games', check: () => GM.stats.games >= 100 },
  { id: 'shutout3', name: 'Wall', desc: '3 total shutouts', check: () => GM.stats.shutouts >= 3 },
  { id: 'shutout5', name: 'Fortress', desc: '5 total shutouts', check: () => GM.stats.shutouts >= 5 },
  { id: 'level10', name: 'Rising Star', desc: 'Reach level 10', check: () => GM.stats.level >= 10 },
  { id: 'level25', name: 'Pro Player', desc: 'Reach level 25', check: () => GM.stats.level >= 25 },
  { id: 'level50', name: 'Legend', desc: 'Reach level 50', check: () => GM.stats.level >= 50 },
  { id: 'score_blowout', name: 'Blowout', desc: 'Win by 5+ goals', check: () => GM.state === 'gameover' && GM.playerScore - GM.aiScore >= 5 },
  { id: 'hard_win', name: 'Fearless', desc: 'Win on Hard', check: () => GM.state === 'gameover' && GM.difficulty === 'hard' && GM.playerScore > GM.aiScore },
  { id: 'speed_win', name: 'Speed Demon', desc: 'Win Speed mode', check: () => GM.state === 'gameover' && GM.mode === 'speed' && GM.playerScore > GM.aiScore },
  { id: 'fashionista', name: 'Fashionista', desc: 'Unlock a skin', check: () => GM.skinUnlocked.size >= 2 },
  { id: 'theme_all', name: 'Tourist', desc: 'Try all themes', check: () => false },
  { id: 'perfect_acc', name: 'Perfect Shot', desc: '100% accuracy game', check: () => GM.shots > 0 && GM.playerScore === GM.shots },
  { id: 'comeback', name: 'Comeback', desc: 'Win after trailing by 3', check: () => false },
  { id: 'playtime_60', name: 'Devoted', desc: 'Play 60 total min', check: () => GM.stats.playTime >= 3600 },
  { id: 'goals_500', name: 'Legend Striker', desc: 'Score 500 total', check: () => GM.stats.totalGoals >= 500 },
  { id: 'powerup1', name: 'Power Collector', desc: 'Collect 5 power-ups', check: () => GM.powerUpsCollected >= 5 },
  { id: 'powerup10', name: 'Power Hoarder', desc: 'Collect 10 power-ups', check: () => GM.powerUpsCollected >= 10 },
  { id: 'shield_block', name: 'Force Field', desc: 'Block a goal with Shield', check: () => false },
  { id: 'freeze_goal', name: 'Frozen Strike', desc: 'Score while AI is frozen', check: () => GM.freezeAI && GM.playerScore > 0 },
  { id: 'daily_3', name: 'Dedicated Daily', desc: 'Win 3 daily challenges', check: () => false },
  { id: 'vs_aggressive', name: 'Tamer', desc: 'Beat an aggressive AI', check: () => GM.state === 'gameover' && GM.aiPersonality === 'aggressive' && GM.playerScore > GM.aiScore },
  { id: 'vs_defensive', name: 'Siege Master', desc: 'Beat a defensive AI', check: () => GM.state === 'gameover' && GM.aiPersonality === 'defensive' && GM.playerScore > GM.aiScore },
  { id: 'big_ball_goal', name: 'Big Score', desc: 'Score with Big Ball active', check: () => GM.bigBallActive && GM.playerScore > 0 },
  { id: 'magnet_goal', name: 'Attraction', desc: 'Score with Magnet active', check: () => GM.magnetActive && GM.playerScore > 0 },
];

// ========== AUDIO ENGINE ==========
class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  droneOscs: OscillatorNode[] = [];
  musicStarted = false;

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = GM.sfxVol / 100;
    this.sfxGain.connect(this.masterGain);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = GM.musicVol / 100;
    this.musicGain.connect(this.masterGain);
  }

  updateVolumes() {
    if (this.sfxGain) this.sfxGain.gain.value = GM.sfxVol / 100;
    if (this.musicGain) this.musicGain.gain.value = GM.musicVol / 100;
  }

  playSfx(type: string) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const pitchVar = 0.95 + Math.random() * 0.1;

    if (type === 'kick') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 220 * pitchVar;
      o.frequency.exponentialRampToValueAtTime(110, t + 0.1);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.15);
    } else if (type === 'hit') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 440 * pitchVar;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.08);
    } else if (type === 'wall') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = 330 * pitchVar;
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.06);
    } else if (type === 'goal') {
      const freqs = [523, 659, 784, 1047];
      freqs.forEach((f, i) => {
        const o = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        o.type = 'sine';
        o.frequency.value = f * pitchVar;
        g.gain.setValueAtTime(0.3, t + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
        o.connect(g); g.connect(this.sfxGain!);
        o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.3);
      });
    } else if (type === 'concede') {
      const freqs = [440, 370, 310, 260];
      freqs.forEach((f, i) => {
        const o = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.2, t + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.2);
        o.connect(g); g.connect(this.sfxGain!);
        o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.2);
      });
    } else if (type === 'countdown') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.1);
    } else if (type === 'go') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 1320;
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.2);
    } else if (type === 'click') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 660 * pitchVar;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.05);
    } else if (type === 'achievement') {
      const freqs = [523, 659, 784, 988, 1047];
      freqs.forEach((f, i) => {
        const o = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.25, t + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.25);
        o.connect(g); g.connect(this.sfxGain!);
        o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.25);
      });
    } else if (type === 'save') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 550 * pitchVar;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.12);
    } else if (type === 'combo') {
      const base = 440 + GM.combo * 55;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = base;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.15);
    }
  }

  startDrone() {
    if (!this.ctx || !this.musicGain || this.musicStarted) return;
    this.musicStarted = true;
    const freqs = [55, 82.5, 110];
    const types: OscillatorType[] = ['sine', 'triangle', 'sine'];
    freqs.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      const lfo = this.ctx!.createOscillator();
      const lfoG = this.ctx!.createGain();
      o.type = types[i]; o.frequency.value = f;
      g.gain.value = 0.08;
      lfo.type = 'sine'; lfo.frequency.value = 0.15 + i * 0.05;
      lfoG.gain.value = 0.02;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      const lp = this.ctx!.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 400;
      o.connect(lp); lp.connect(g); g.connect(this.musicGain!);
      o.start(); lfo.start();
      this.droneOscs.push(o);
    });
  }
}

const audio = new AudioEngine();

// ========== PARTICLE SYSTEM ==========
interface Particle {
  mesh: Mesh;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  active: boolean;
}

const particles: Particle[] = [];
let particlePool: Particle[] | null = null;

function initParticles(scene: any) {
  particlePool = [];
  const geo = new SphereGeometry(0.015, 4, 4);
  for (let i = 0; i < 150; i++) {
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending });
    const mesh = new Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    particlePool.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, active: false });
  }
}

function spawnParticles(x: number, y: number, z: number, color: number, count: number) {
  if (!particlePool) return;
  let spawned = 0;
  for (const p of particlePool) {
    if (p.active || spawned >= count) continue;
    p.mesh.position.set(x, y, z);
    (p.mesh.material as MeshBasicMaterial).color.setHex(color);
    (p.mesh.material as MeshBasicMaterial).opacity = 1;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    p.vx = Math.cos(angle) * speed;
    p.vy = 1.5 + Math.random() * 3;
    p.vz = Math.sin(angle) * speed;
    p.life = 0;
    p.maxLife = 0.5 + Math.random() * 0.5;
    p.active = true;
    p.mesh.visible = true;
    spawned++;
  }
}

function updateParticles(delta: number) {
  if (!particlePool) return;
  for (const p of particlePool) {
    if (!p.active) continue;
    p.life += delta;
    if (p.life >= p.maxLife) { p.active = false; p.mesh.visible = false; continue; }
    p.vy -= 6 * delta;
    p.mesh.position.x += p.vx * delta;
    p.mesh.position.y += p.vy * delta;
    p.mesh.position.z += p.vz * delta;
    (p.mesh.material as MeshBasicMaterial).opacity = 1 - p.life / p.maxLife;
  }
}

// ========== MAIN ENTRY ==========
const container = document.getElementById('app') as HTMLDivElement;
const world = await World.create(container, {
  xr: { offer: 'once' },
  features: { locomotion: true },
} as any);

const scene = world.scene;
scene.fog = new FogExp2(new Color(THEMES[0].fog).getHex(), 0.04);
scene.add(new AmbientLight(0x222244, 0.4));
const dirLight = new DirectionalLight(0xffffff, 0.6);
dirLight.position.set(3, 8, 2);
scene.add(dirLight);

// Accent lights
const accentLight1 = new PointLight(new Color(THEMES[0].accent).getHex(), 1.5, 15);
accentLight1.position.set(-2, 3, 0);
scene.add(accentLight1);
const accentLight2 = new PointLight(new Color(THEMES[0].glow).getHex(), 1.0, 12);
accentLight2.position.set(2, 3, 0);
scene.add(accentLight2);

initParticles(scene);

// ========== HOLODECK ENVIRONMENT ==========
function buildHolodeck() {
  const theme = GM.theme;
  const gridColor = new Color(theme.grid).getHex();
  const gridMat = new LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.3 });
  // Floor grid
  for (let i = -10; i <= 10; i++) {
    const geo1 = new BoxGeometry(0.005, 0.005, 20);
    const m1 = new Mesh(geo1, new MeshBasicMaterial({ color: gridColor, transparent: true, opacity: 0.15 }));
    m1.position.set(i, -0.01, 0);
    scene.add(m1);
    const geo2 = new BoxGeometry(20, 0.005, 0.005);
    const m2 = new Mesh(geo2, new MeshBasicMaterial({ color: gridColor, transparent: true, opacity: 0.15 }));
    m2.position.set(0, -0.01, i);
    scene.add(m2);
  }
  // Ceiling grid
  for (let i = -10; i <= 10; i += 2) {
    const geo1 = new BoxGeometry(0.003, 0.003, 20);
    const m1 = new Mesh(geo1, new MeshBasicMaterial({ color: gridColor, transparent: true, opacity: 0.08 }));
    m1.position.set(i, 5, 0);
    scene.add(m1);
    const geo2 = new BoxGeometry(20, 0.003, 0.003);
    const m2 = new Mesh(geo2, new MeshBasicMaterial({ color: gridColor, transparent: true, opacity: 0.08 }));
    m2.position.set(0, 5, i);
    scene.add(m2);
  }
  // Floating decorations
  const shapes = [TorusGeometry, BoxGeometry, SphereGeometry, CylinderGeometry];
  for (let i = 0; i < 14; i++) {
    const ShapeClass = shapes[i % shapes.length];
    let geo;
    if (ShapeClass === TorusGeometry) geo = new TorusGeometry(0.2, 0.05, 8, 16);
    else if (ShapeClass === BoxGeometry) geo = new BoxGeometry(0.3, 0.3, 0.3);
    else if (ShapeClass === SphereGeometry) geo = new SphereGeometry(0.2, 8, 8);
    else geo = new CylinderGeometry(0, 0.2, 0.35, 6);
    const mat = new MeshBasicMaterial({ color: gridColor, wireframe: true, transparent: true, opacity: 0.15 });
    const m = new Mesh(geo, mat);
    const angle = (i / 14) * Math.PI * 2;
    m.position.set(Math.cos(angle) * 7, 2 + Math.sin(i * 1.3) * 1.5, Math.sin(angle) * 7);
    m.userData = { rotSpeed: 0.3 + Math.random() * 0.5, bobSpeed: 0.5 + Math.random() * 0.3, bobAmp: 0.1 + Math.random() * 0.15, baseY: m.position.y };
    scene.add(m);
    floatingDecos.push(m);
  }
}

const floatingDecos: Mesh[] = [];
buildHolodeck();

// ========== FOOSBALL TABLE ==========
const tableGroup = new Group();
tableGroup.position.set(0, 1.0, -2.5);
scene.add(tableGroup);

// Table surface
const tableMat = new MeshStandardMaterial({ color: new Color(GM.theme.table), metalness: 0.3, roughness: 0.7 });
const tableTop = new Mesh(new BoxGeometry(TABLE_W, TABLE_H, TABLE_L), tableMat);
tableGroup.add(tableTop);

// Table edges (wireframe)
const tableEdges = new LineSegments(
  new EdgesGeometry(new BoxGeometry(TABLE_W, TABLE_H, TABLE_L)),
  new LineBasicMaterial({ color: new Color(GM.theme.accent).getHex(), transparent: true, opacity: 0.6 })
);
tableGroup.add(tableEdges);

// Walls (left, right, top ends)
const wallMat = new MeshStandardMaterial({ color: new Color(GM.theme.wall), metalness: 0.4, roughness: 0.5 });
const wallLeft = new Mesh(new BoxGeometry(0.05, WALL_H, TABLE_L), wallMat);
wallLeft.position.set(-TABLE_W / 2 - 0.025, TABLE_H / 2 + WALL_H / 2, 0);
tableGroup.add(wallLeft);
const wallRight = new Mesh(new BoxGeometry(0.05, WALL_H, TABLE_L), wallMat);
wallRight.position.set(TABLE_W / 2 + 0.025, TABLE_H / 2 + WALL_H / 2, 0);
tableGroup.add(wallRight);

// End walls with goal openings (player end = +Z, AI end = -Z)
function makeEndWall(zSide: number) {
  const sideW = (TABLE_W - GOAL_W) / 2;
  const wL = new Mesh(new BoxGeometry(sideW, WALL_H, 0.05), wallMat);
  wL.position.set(-TABLE_W / 2 + sideW / 2, TABLE_H / 2 + WALL_H / 2, zSide * TABLE_L / 2);
  tableGroup.add(wL);
  const wR = new Mesh(new BoxGeometry(sideW, WALL_H, 0.05), wallMat);
  wR.position.set(TABLE_W / 2 - sideW / 2, TABLE_H / 2 + WALL_H / 2, zSide * TABLE_L / 2);
  tableGroup.add(wR);
  // Goal glow
  const goalGlow = new Mesh(
    new BoxGeometry(GOAL_W, 0.02, 0.06),
    new MeshBasicMaterial({ color: zSide > 0 ? 0xff4444 : 0x00ff88, transparent: true, opacity: 0.5, blending: AdditiveBlending })
  );
  goalGlow.position.set(0, TABLE_H / 2 + 0.01, zSide * TABLE_L / 2);
  tableGroup.add(goalGlow);
  return goalGlow;
}
const playerGoalGlow = makeEndWall(1); // Player defends +Z
const aiGoalGlow = makeEndWall(-1); // AI defends -Z

// Grid lines on table surface
const gridLineMat = new MeshBasicMaterial({ color: new Color(GM.theme.grid).getHex(), transparent: true, opacity: 0.2 });
for (let i = -Math.floor(TABLE_W / 2 * 4); i <= Math.floor(TABLE_W / 2 * 4); i++) {
  const line = new Mesh(new BoxGeometry(0.003, 0.002, TABLE_L), gridLineMat);
  line.position.set(i * 0.25, TABLE_H / 2 + 0.001, 0);
  tableGroup.add(line);
}
for (let i = -Math.floor(TABLE_L / 2 * 3); i <= Math.floor(TABLE_L / 2 * 3); i++) {
  const line = new Mesh(new BoxGeometry(TABLE_W, 0.002, 0.003), gridLineMat);
  line.position.set(0, TABLE_H / 2 + 0.001, i * 0.33);
  tableGroup.add(line);
}
// Center line
const centerLine = new Mesh(new BoxGeometry(TABLE_W, 0.003, 0.01), new MeshBasicMaterial({ color: new Color(GM.theme.accent).getHex(), transparent: true, opacity: 0.4 }));
centerLine.position.set(0, TABLE_H / 2 + 0.002, 0);
tableGroup.add(centerLine);

// ========== BALL ==========
const ballGeo = new SphereGeometry(BALL_R, 16, 16);
const ballMat = new MeshStandardMaterial({ color: new Color(GM.theme.ball), emissive: new Color(GM.theme.ball), emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 });
const ballMesh = new Mesh(ballGeo, ballMat);
ballMesh.position.set(0, TABLE_H / 2 + BALL_R, 0);
tableGroup.add(ballMesh);
// Ball glow
const ballGlow = new Mesh(
  new SphereGeometry(BALL_R * 2.5, 8, 8),
  new MeshBasicMaterial({ color: new Color(GM.theme.ball).getHex(), transparent: true, opacity: 0.3, blending: AdditiveBlending })
);
ballMesh.add(ballGlow);

// ========== BALL TRAIL ==========
const TRAIL_MAX = 12;
const trailMeshes: Mesh[] = [];
const trailGeo = new SphereGeometry(BALL_R * 0.6, 6, 6);
for (let i = 0; i < TRAIL_MAX; i++) {
  const mat = new MeshBasicMaterial({ color: new Color(GM.theme.ball).getHex(), transparent: true, opacity: 0, blending: AdditiveBlending });
  const tm = new Mesh(trailGeo, mat);
  tm.visible = false;
  tableGroup.add(tm);
  trailMeshes.push(tm);
}

function updateBallTrail() {
  const speed = Math.sqrt(GM.ballVX * GM.ballVX + GM.ballVZ * GM.ballVZ);
  if (speed > 1.0 && GM.state === 'playing') {
    GM.ballTrailPositions.unshift({ x: GM.ballX, z: GM.ballZ, age: 0 });
    if (GM.ballTrailPositions.length > TRAIL_MAX) GM.ballTrailPositions.length = TRAIL_MAX;
  }
  for (let i = 0; i < TRAIL_MAX; i++) {
    const pos = GM.ballTrailPositions[i];
    if (pos && pos.age < 0.4) {
      trailMeshes[i].visible = true;
      trailMeshes[i].position.set(pos.x, TABLE_H / 2 + BALL_R, pos.z);
      const alpha = 1 - pos.age / 0.4;
      (trailMeshes[i].material as MeshBasicMaterial).opacity = alpha * 0.25;
      const s = 1 - pos.age / 0.4;
      trailMeshes[i].scale.setScalar(s);
    } else {
      trailMeshes[i].visible = false;
    }
  }
}

// ========== POWER-UP VISUALS ==========
const powerUpGroup = new Group();
powerUpGroup.visible = false;
tableGroup.add(powerUpGroup);
const powerUpOrb = new Mesh(
  new SphereGeometry(0.06, 12, 12),
  new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: AdditiveBlending })
);
powerUpGroup.add(powerUpOrb);
const powerUpRing = new Mesh(
  new TorusGeometry(0.1, 0.01, 8, 16),
  new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: AdditiveBlending })
);
powerUpRing.rotation.x = Math.PI / 2;
powerUpGroup.add(powerUpRing);
const powerUpGlow = new Mesh(
  new SphereGeometry(0.15, 8, 8),
  new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, blending: AdditiveBlending })
);
powerUpGroup.add(powerUpGlow);

// Shield mesh (semi-transparent wall at player goal)
const shieldMesh = new Mesh(
  new BoxGeometry(GOAL_W, WALL_H * 1.5, 0.03),
  new MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0, blending: AdditiveBlending })
);
shieldMesh.position.set(0, TABLE_H / 2 + WALL_H * 0.75, TABLE_L / 2);
tableGroup.add(shieldMesh);

function spawnPowerUp() {
  const idx = Math.floor(Math.random() * POWER_UPS.length);
  const pu = POWER_UPS[idx];
  GM.powerUpX = (Math.random() - 0.5) * (TABLE_W - 0.4);
  GM.powerUpZ = (Math.random() - 0.5) * (TABLE_L - 1.0);
  GM.activePowerUp = pu.id;
  GM.powerUpActive = true;
  powerUpGroup.visible = true;
  powerUpGroup.position.set(GM.powerUpX, TABLE_H / 2 + 0.12, GM.powerUpZ);
  (powerUpOrb.material as MeshBasicMaterial).color.setHex(pu.color);
  (powerUpRing.material as MeshBasicMaterial).color.setHex(pu.color);
  (powerUpGlow.material as MeshBasicMaterial).color.setHex(pu.color);
}

function collectPowerUp() {
  if (!GM.powerUpActive || !GM.activePowerUp) return;
  const pu = POWER_UPS.find(p => p.id === GM.activePowerUp);
  if (!pu) return;
  GM.powerUpTimer = pu.duration;
  GM.powerUpActive = false;
  powerUpGroup.visible = false;
  GM.powerUpsCollected++;

  // Activate effects
  if (pu.id === 'big_ball') {
    GM.bigBallActive = true;
    ballMesh.scale.setScalar(2);
  } else if (pu.id === 'freeze') {
    GM.freezeAI = true;
  } else if (pu.id === 'magnet') {
    GM.magnetActive = true;
  } else if (pu.id === 'shield') {
    GM.shieldTimer = pu.duration;
    (shieldMesh.material as MeshBasicMaterial).opacity = 0.4;
  }
  showToast(`* ${pu.name} *`);
  audio.playSfx('achievement');
}

function deactivatePowerUp() {
  GM.bigBallActive = false;
  GM.freezeAI = false;
  GM.magnetActive = false;
  GM.shieldTimer = 0;
  (shieldMesh.material as MeshBasicMaterial).opacity = 0;
  ballMesh.scale.setScalar(1);
  GM.activePowerUp = null;
}

function updatePowerUps(dt: number) {
  if (GM.state !== 'playing') return;

  // Active power-up countdown
  if (GM.powerUpTimer > 0) {
    GM.powerUpTimer -= dt;
    if (GM.powerUpTimer <= 0) deactivatePowerUp();
  }

  // Shield visual
  if (GM.shieldTimer > 0) {
    GM.shieldTimer -= dt;
    const pulse = 0.3 + Math.sin(performance.now() * 0.01) * 0.1;
    (shieldMesh.material as MeshBasicMaterial).opacity = GM.shieldTimer > 0 ? pulse : 0;
    if (GM.shieldTimer <= 0) (shieldMesh.material as MeshBasicMaterial).opacity = 0;
  }

  // Spawn timer
  if (!GM.powerUpActive && GM.powerUpTimer <= 0) {
    GM.powerUpSpawnTimer -= dt;
    if (GM.powerUpSpawnTimer <= 0) {
      spawnPowerUp();
      GM.powerUpSpawnTimer = 12 + Math.random() * 10;
    }
  }

  // Animate power-up orb
  if (GM.powerUpActive) {
    powerUpGroup.position.y = TABLE_H / 2 + 0.12 + Math.sin(performance.now() * 0.004) * 0.03;
    powerUpRing.rotation.z += 2 * dt;
    powerUpGlow.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.2);

    // Check ball collision with power-up
    const dx = GM.ballX - GM.powerUpX;
    const dz = GM.ballZ - GM.powerUpZ;
    if (Math.sqrt(dx * dx + dz * dz) < 0.12) {
      collectPowerUp();
    }
  }

  // Magnet effect: curve ball toward nearest player rod
  if (GM.magnetActive) {
    const rod = playerRods[GM.selectedRod];
    if (rod) {
      const targetZ = rod.zPos;
      const dz = targetZ - GM.ballZ;
      GM.ballVZ += Math.sign(dz) * 0.5 * dt;
    }
  }
}

// ========== RODS & PLAYERS ==========
// Rod layout: [zOffset from center, playerCount, spacing]
// Player side (+Z = player defending): GK at +Z, ATK at center-ish
// AI side (-Z = AI defending): GK at -Z, ATK at center-ish
const ROD_CONFIGS = [
  { z: 2.2, count: 1, spacing: 0 },     // GK
  { z: 1.5, count: 2, spacing: 0.65 },   // DEF
  { z: 0.5, count: 5, spacing: 0.35 },   // MID
  { z: -0.3, count: 3, spacing: 0.5 },   // ATK
];

const playerRods: Rod[] = [];
const aiRods: Rod[] = [];

function createRod(zPos: number, playerCount: number, spacing: number, isPlayerSide: boolean, color: string): Rod {
  const group = new Group();
  group.position.set(0, TABLE_H / 2 + PLAYER_H / 2, zPos);
  tableGroup.add(group);

  // Rod bar
  const rodMesh = new Mesh(
    new CylinderGeometry(ROD_R, ROD_R, TABLE_W + 0.3, 8),
    new MeshStandardMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.2 })
  );
  rodMesh.rotation.z = Math.PI / 2;
  group.add(rodMesh);

  // Rod glow
  const rodGlow = new Mesh(
    new CylinderGeometry(ROD_R * 2, ROD_R * 2, TABLE_W + 0.3, 8),
    new MeshBasicMaterial({ color: new Color(color).getHex(), transparent: true, opacity: 0.15, blending: AdditiveBlending })
  );
  rodGlow.rotation.z = Math.PI / 2;
  group.add(rodGlow);

  // Player figures
  const players: Mesh[] = [];
  const playerMat = new MeshStandardMaterial({
    color: new Color(color),
    emissive: new Color(color),
    emissiveIntensity: 0.3,
    metalness: 0.4,
    roughness: 0.5,
  });

  for (let i = 0; i < playerCount; i++) {
    const xOffset = playerCount === 1 ? 0 : (i - (playerCount - 1) / 2) * spacing;
    const pGroup = new Group();
    pGroup.position.set(xOffset, 0, 0);

    // Body (cylinder)
    const body = new Mesh(new CylinderGeometry(PLAYER_R, PLAYER_R, PLAYER_H, 8), playerMat);
    pGroup.add(body);
    // Head (sphere)
    const head = new Mesh(new SphereGeometry(PLAYER_R * 0.8, 8, 8), playerMat);
    head.position.y = PLAYER_H / 2 + PLAYER_R * 0.5;
    pGroup.add(head);
    // Foot (box for kicking)
    const foot = new Mesh(new BoxGeometry(PLAYER_R * 1.5, PLAYER_R, PLAYER_R * 2), playerMat);
    foot.position.y = -PLAYER_H / 2;
    foot.position.z = PLAYER_R * 0.8 * (isPlayerSide ? -1 : 1);
    pGroup.add(foot);
    // Wireframe overlay
    const wireGeo = new EdgesGeometry(new CylinderGeometry(PLAYER_R, PLAYER_R, PLAYER_H, 8));
    const wire = new LineSegments(wireGeo, new LineBasicMaterial({ color: new Color(color).getHex(), transparent: true, opacity: 0.4 }));
    pGroup.add(wire);

    group.add(pGroup);
    players.push(pGroup as unknown as Mesh);
  }

  return { group, players, zPos, slidePos: 0, kickAngle: 0, kickSpeed: 0, playerCount, playerSpacing: spacing, isPlayer: isPlayerSide };
}

// Build player rods (defending +Z side, attacking toward -Z)
ROD_CONFIGS.forEach((cfg, i) => {
  playerRods.push(createRod(cfg.z, cfg.count, cfg.spacing, true, GM.theme.player1));
});
// Build AI rods (mirrored, defending -Z side)
ROD_CONFIGS.forEach((cfg, i) => {
  aiRods.push(createRod(-cfg.z, cfg.count, cfg.spacing, false, GM.theme.player2));
});

// ========== SELECTED ROD INDICATOR ==========
const selectedIndicator = new Mesh(
  new TorusGeometry(0.08, 0.015, 8, 16),
  new MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.7, blending: AdditiveBlending })
);
selectedIndicator.rotation.x = Math.PI / 2;
tableGroup.add(selectedIndicator);

function updateSelectedIndicator() {
  const rod = playerRods[GM.selectedRod];
  if (rod) {
    selectedIndicator.position.set(TABLE_W / 2 + 0.2, TABLE_H / 2 + PLAYER_H / 2, rod.zPos);
    selectedIndicator.visible = GM.state === 'playing';
  }
}

// ========== PANELS ==========
const panelConfigs = [
  { name: 'title', config: './ui/title.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'modeselect', config: './ui/modeselect.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'difficulty', config: './ui/difficulty.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'hud', config: './ui/hud.json', type: 'follower', pos: [0, 0, 0] as const },
  { name: 'actions', config: './ui/actions.json', type: 'screen', pos: [0, 0, 0] as const },
  { name: 'pause', config: './ui/pause.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'gameover', config: './ui/gameover.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'leaderboard', config: './ui/leaderboard.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'achievements', config: './ui/achievements.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'settings', config: './ui/settings.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'help', config: './ui/help.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'stats', config: './ui/stats.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'skins', config: './ui/skins.json', type: 'world', pos: [0, 2.0, -4] as const },
  { name: 'toast', config: './ui/toast.json', type: 'follower', pos: [0, 0, 0] as const },
  { name: 'countdown', config: './ui/countdown.json', type: 'follower', pos: [0, 0, 0] as const },
  { name: 'goal', config: './ui/goal.json', type: 'follower', pos: [0, 0, 0] as const },
];

const panelEntities: Record<string, any> = {};

for (const pc of panelConfigs) {
  const entity = world.createTransformEntity();
  entity.addComponent(PanelUI, { config: pc.config });
  if (pc.type === 'follower') {
    entity.addComponent(Follower);
    const view = entity.getVectorView(Follower, 'offsetPosition');
    if (pc.name === 'hud') { view[0] = 0; view[1] = 0.25; view[2] = -0.8; }
    else if (pc.name === 'toast') { view[0] = 0; view[1] = 0.15; view[2] = -0.7; }
    else if (pc.name === 'countdown') { view[0] = 0; view[1] = 0; view[2] = -0.6; }
    else if (pc.name === 'goal') { view[0] = 0; view[1] = 0.1; view[2] = -0.7; }
    Follower.data.target[entity.index] = world.player.head;
  } else if (pc.type === 'screen') {
    entity.addComponent(ScreenSpace);
  } else {
    if (entity.object3D) {
      entity.object3D.position.set(pc.pos[0], pc.pos[1], pc.pos[2]);
    }
  }
  panelEntities[pc.name] = entity;
}

// ========== TOAST SYSTEM ==========
let toastTimer = 0;
const toastQueue: string[] = [];

function showToast(msg: string) { toastQueue.push(msg); }

function processToast(delta: number) {
  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) setPanelVisible('toast', false);
    return;
  }
  if (toastQueue.length === 0) return;
  const msg = toastQueue.shift()!;
  setPanelText('toast', 'toast-text', msg);
  setPanelVisible('toast', true);
  toastTimer = 2.0;
}

// ========== PANEL HELPERS ==========
const panelDocs: Record<string, UIKitDocument> = {};

function getDoc(name: string): UIKitDocument | undefined { return panelDocs[name]; }

function setPanelText(panel: string, id: string, text: string) {
  const doc = getDoc(panel);
  if (!doc) return;
  const el = doc.getElementById(id) as any;
  el?.setProperties({ text });
}

function setPanelVisible(panel: string, visible: boolean) {
  const entity = panelEntities[panel];
  if (!entity?.object3D) return;
  entity.object3D.visible = visible;
}

function showPanel(name: string) {
  for (const pc of panelConfigs) {
    const shouldShow = pc.name === name ||
      (name === 'playing' && (pc.name === 'hud' || pc.name === 'actions')) ||
      (name === 'countdown' && pc.name === 'countdown');
    setPanelVisible(pc.name, shouldShow);
  }
}

// ========== CHECK ACHIEVEMENTS ==========
function checkAchievements() {
  for (const ach of ACHIEVEMENTS) {
    if (GM.achievementsUnlocked.has(ach.id)) continue;
    if (ach.check()) {
      GM.achievementsUnlocked.add(ach.id);
      showToast(`* ${ach.name} *`);
      audio.playSfx('achievement');
      // Check skin unlocks
      if (GM.stats.wins >= 10) GM.skinUnlocked.add(1);
      if (GM.stats.totalGoals >= 50) GM.skinUnlocked.add(2);
      if (GM.stats.games >= 25) GM.skinUnlocked.add(3);
      if (GM.stats.shutouts >= 5) GM.skinUnlocked.add(4);
      if (GM.tournamentWins >= 4) GM.skinUnlocked.add(5);
      if (GM.bestCombo >= 8) GM.skinUnlocked.add(6);
      if (GM.stats.totalGoals >= 100) GM.skinUnlocked.add(7);
    }
  }
}

// ========== STATE TRANSITIONS ==========
function setState(newState: GameState) {
  GM.state = newState;
  if (newState === 'title') {
    showPanel('title');
    updateTitlePanel();
    tableGroup.visible = false;
  } else if (newState === 'modeselect') {
    showPanel('modeselect');
    tableGroup.visible = false;
  } else if (newState === 'difficulty') {
    showPanel('difficulty');
  } else if (newState === 'countdown') {
    showPanel('countdown');
    tableGroup.visible = true;
    GM.countdownVal = 3;
    GM.countdownTimer = 0;
    GM.resetMatch();
    updateBallPosition();
    resetAllRods();
    setPanelText('countdown', 'countdown-text', '3');
    audio.playSfx('countdown');
  } else if (newState === 'playing') {
    showPanel('playing');
    tableGroup.visible = true;
    updateHUD();
    audio.init();
    audio.startDrone();
  } else if (newState === 'paused') {
    showPanel('pause');
  } else if (newState === 'goal') {
    // Shown briefly then back to playing/countdown
    showPanel('goal');
    GM.goalDisplayTimer = 1.5;
  } else if (newState === 'gameover') {
    showPanel('gameover');
    updateGameOverPanel();
    finishMatch();
  } else if (newState === 'leaderboard') {
    showPanel('leaderboard');
    updateLeaderboardPanel();
  } else if (newState === 'achievements') {
    showPanel('achievements');
    updateAchievementsPanel();
  } else if (newState === 'settings') {
    showPanel('settings');
    updateSettingsPanel();
  } else if (newState === 'help') {
    showPanel('help');
  } else if (newState === 'stats') {
    showPanel('stats');
    updateStatsPanel();
  } else if (newState === 'skins') {
    showPanel('skins');
    updateSkinsPanel();
  }
}

function updateTitlePanel() {
  setPanelText('title', 'level-display', `Level ${GM.stats.level} - ${GM.levelTitle}`);
}

function updateHUD() {
  setPanelText('hud', 'score-display', `${GM.playerScore} - ${GM.aiScore}`);
  setPanelText('hud', 'mode-label', GM.mode.charAt(0).toUpperCase() + GM.mode.slice(1));
  const rodNames = ['GK', 'DEF', 'MID', 'ATK'];
  setPanelText('hud', 'rod-label', `Rod: ${rodNames[GM.selectedRod]}`);
  setPanelText('hud', 'combo-label', GM.combo > 1 ? `x${GM.combo}` : '');
  // Show active power-up
  if (GM.powerUpTimer > 0 && GM.activePowerUp) {
    const pu = POWER_UPS.find(p => p.id === GM.activePowerUp);
    setPanelText('hud', 'powerup-label', pu ? `${pu.name} ${Math.ceil(GM.powerUpTimer)}s` : '');
  } else {
    setPanelText('hud', 'powerup-label', '');
  }
  // Show AI personality
  setPanelText('hud', 'ai-label', `AI: ${GM.aiPersonality.charAt(0).toUpperCase() + GM.aiPersonality.slice(1)}`);
  if (GM.mode === 'timed') {
    const mins = Math.floor(GM.timeLeft / 60);
    const secs = Math.floor(GM.timeLeft % 60);
    setPanelText('hud', 'time-display', `${mins}:${secs < 10 ? '0' : ''}${secs}`);
  } else if (GM.mode === 'survival') {
    const mins = Math.floor(GM.survivalTime / 60);
    const secs = Math.floor(GM.survivalTime % 60);
    setPanelText('hud', 'time-display', `${mins}:${secs < 10 ? '0' : ''}${secs}`);
  } else {
    setPanelText('hud', 'time-display', `${Math.floor(GM.matchTime / 60)}:${Math.floor(GM.matchTime % 60).toString().padStart(2, '0')}`);
  }
}

function updateGameOverPanel() {
  const won = GM.playerScore > GM.aiScore;
  setPanelText('gameover', 'result-title', won ? 'YOU WIN!' : 'YOU LOSE');
  setPanelText('gameover', 'final-score', `${GM.playerScore} - ${GM.aiScore}`);
  setPanelText('gameover', 'mode-info', GM.mode.charAt(0).toUpperCase() + GM.mode.slice(1));
  setPanelText('gameover', 'stat-goals', `Goals: ${GM.playerScore}`);
  setPanelText('gameover', 'stat-shots', `Shots: ${GM.shots}`);
  const acc = GM.shots > 0 ? Math.round((GM.playerScore / GM.shots) * 100) : 0;
  setPanelText('gameover', 'stat-accuracy', `Accuracy: ${acc}%`);
  setPanelText('gameover', 'stat-saves', `Saves: ${GM.saves}`);
  const mins = Math.floor(GM.matchTime / 60);
  const secs = Math.floor(GM.matchTime % 60);
  setPanelText('gameover', 'stat-time', `Time: ${mins}:${secs < 10 ? '0' : ''}${secs}`);
  setPanelText('gameover', 'stat-combo', `Best Combo: x${GM.bestCombo}`);
  const xpGain = GM.playerScore * 10 + (won ? 50 : 10) + GM.bestCombo * 5;
  GM.addXP(xpGain);
  setPanelText('gameover', 'stat-xp', `+${xpGain} XP`);
  setPanelText('gameover', 'stat-powerups', `Power-ups: ${GM.powerUpsCollected}`);
  setPanelText('gameover', 'stat-ai', `AI: ${GM.aiPersonality.charAt(0).toUpperCase() + GM.aiPersonality.slice(1)}`);
}

function updateLeaderboardPanel() {
  for (let i = 0; i < 10; i++) {
    const entry = GM.leaderboard[i];
    const text = entry ? `${i + 1}. ${entry.score} ${entry.mode} ${entry.accuracy} ${entry.date}` : `${i + 1}. ---`;
    setPanelText('leaderboard', `row${i}`, text);
  }
}

function updateAchievementsPanel() {
  const perPage = 15;
  const totalPages = Math.ceil(ACHIEVEMENTS.length / perPage);
  const start = GM.achPage * perPage;
  for (let i = 0; i < perPage; i++) {
    const idx = start + i;
    const ach = ACHIEVEMENTS[idx];
    if (ach) {
      const unlocked = GM.achievementsUnlocked.has(ach.id);
      setPanelText('achievements', `ach${i}`, `${unlocked ? '[x]' : '[ ]'} ${ach.name} - ${ach.desc}`);
    } else {
      setPanelText('achievements', `ach${i}`, '');
    }
  }
  setPanelText('achievements', 'page-label', `${GM.achPage + 1}/${totalPages}`);
}

function updateStatsPanel() {
  setPanelText('stats', 'stat0', `Games Played: ${GM.stats.games}`);
  setPanelText('stats', 'stat1', `Wins: ${GM.stats.wins}`);
  setPanelText('stats', 'stat2', `Losses: ${GM.stats.losses}`);
  const wr = GM.stats.games > 0 ? Math.round((GM.stats.wins / GM.stats.games) * 100) : 0;
  setPanelText('stats', 'stat3', `Win Rate: ${wr}%`);
  setPanelText('stats', 'stat4', `Total Goals: ${GM.stats.totalGoals}`);
  setPanelText('stats', 'stat5', `Goals Conceded: ${GM.stats.totalConceded}`);
  setPanelText('stats', 'stat6', `Best Combo: x${GM.stats.bestCombo}`);
  setPanelText('stats', 'stat7', `Total Shots: ${GM.stats.totalShots}`);
  setPanelText('stats', 'stat8', `Total Saves: ${GM.stats.totalSaves}`);
  const ptMins = Math.floor(GM.stats.playTime / 60);
  setPanelText('stats', 'stat9', `Play Time: ${ptMins}m`);
  setPanelText('stats', 'stat10', `Win Streak: ${GM.stats.winStreak}`);
  setPanelText('stats', 'stat11', `Level: ${GM.stats.level} (${GM.stats.xp} XP)`);
}

function updateSettingsPanel() {
  setPanelText('settings', 'sfx-val', `${GM.sfxVol}%`);
  setPanelText('settings', 'music-val', `${GM.musicVol}%`);
  setPanelText('settings', 'theme-val', GM.theme.name);
}

function updateSkinsPanel() {
  SKINS.forEach((s, i) => {
    const owned = GM.skinUnlocked.has(i);
    const equipped = GM.skinIdx === i;
    const prefix = equipped ? '[*]' : owned ? '[ ]' : '[L]';
    setPanelText('skins', `skin${i}`, `${prefix} ${s.name} (${s.unlock})`);
  });
}

function finishMatch() {
  GM.stats.games++;
  GM.stats.totalGoals += GM.playerScore;
  GM.stats.totalConceded += GM.aiScore;
  GM.stats.totalShots += GM.shots;
  GM.stats.totalSaves += GM.saves;
  GM.stats.playTime += GM.matchTime;
  GM.stats.modesPlayed.add(GM.mode);
  if (GM.bestCombo > GM.stats.bestCombo) GM.stats.bestCombo = GM.bestCombo;
  const won = GM.playerScore > GM.aiScore;
  if (won) {
    GM.stats.wins++;
    GM.stats.currentStreak++;
    if (GM.stats.currentStreak > GM.stats.winStreak) GM.stats.winStreak = GM.stats.currentStreak;
    if (GM.aiScore === 0) GM.stats.shutouts++;
  } else {
    GM.stats.losses++;
    GM.stats.currentStreak = 0;
  }
  // Add to leaderboard
  const acc = GM.shots > 0 ? Math.round((GM.playerScore / GM.shots) * 100) : 0;
  const d = new Date();
  GM.leaderboard.push({
    score: `${GM.playerScore}-${GM.aiScore}`,
    mode: GM.mode.charAt(0).toUpperCase() + GM.mode.slice(1),
    accuracy: `${acc}%`,
    date: `${d.getMonth() + 1}/${d.getDate()}`,
  });
  GM.leaderboard.sort((a, b) => {
    const sa = parseInt(a.score.split('-')[0]);
    const sb = parseInt(b.score.split('-')[0]);
    return sb - sa;
  });
  GM.leaderboard = GM.leaderboard.slice(0, 20);
  checkAchievements();
  GM.save();
}

// ========== BALL PHYSICS ==========
function updateBallPosition() {
  ballMesh.position.x = GM.ballX;
  ballMesh.position.z = GM.ballZ;
  ballMesh.position.y = TABLE_H / 2 + BALL_R;
}

function resetAllRods() {
  [...playerRods, ...aiRods].forEach(rod => {
    rod.slidePos = 0;
    rod.kickAngle = 0;
    rod.kickSpeed = 0;
    rod.group.position.x = 0;
    rod.players.forEach(p => (p as unknown as Group).rotation.x = 0);
  });
}

function updateBallPhysics(delta: number) {
  if (GM.state !== 'playing') return;

  const speedMult = GM.ballSpeedMult;
  GM.ballX += GM.ballVX * delta * speedMult;
  GM.ballZ += GM.ballVZ * delta * speedMult;

  // Wall collisions (left/right)
  const halfW = TABLE_W / 2 - BALL_R;
  if (GM.ballX < -halfW) { GM.ballX = -halfW; GM.ballVX = Math.abs(GM.ballVX) * 0.9; audio.playSfx('wall'); }
  if (GM.ballX > halfW) { GM.ballX = halfW; GM.ballVX = -Math.abs(GM.ballVX) * 0.9; audio.playSfx('wall'); }

  // End wall collisions (with goal openings)
  const halfL = TABLE_L / 2 - BALL_R;
  const halfGoal = GOAL_W / 2;

  // Player goal (+Z end)
  if (GM.ballZ > halfL) {
    if (Math.abs(GM.ballX) < halfGoal) {
      // Shield power-up blocks goals
      if (GM.shieldTimer > 0) {
        GM.ballZ = halfL;
        GM.ballVZ = -Math.abs(GM.ballVZ) * 0.9;
        audio.playSfx('save');
        showToast('SHIELD BLOCK!');
        spawnParticles(GM.ballX + tableGroup.position.x, 1.2, GM.ballZ + tableGroup.position.z, 0xffff00, 15);
      } else {
        // AI scores!
        GM.aiScore++;
        audio.playSfx('concede');
        spawnParticles(GM.ballX + tableGroup.position.x, 1.2, GM.ballZ + tableGroup.position.z, 0xff4444, 20);
        GM.combo = 0;
        deactivatePowerUp();
        setPanelText('goal', 'scorer-text', 'AI scored!');
        setPanelText('goal', 'score-text', `${GM.playerScore} - ${GM.aiScore}`);
        setState('goal');
        GM.resetBall();
        resetAllRods();
        checkMatchEnd();
        return;
      }
    } else {
      GM.ballZ = halfL;
      GM.ballVZ = -Math.abs(GM.ballVZ) * 0.9;
      audio.playSfx('wall');
    }
  }

  // AI goal (-Z end)
  if (GM.ballZ < -halfL) {
    if (Math.abs(GM.ballX) < halfGoal) {
      // Player scores!
      GM.playerScore++;
      GM.stats.totalGoals++;
      GM.lastGoalTime = GM.matchTime;
      GM.combo++;
      GM.comboTimer = 5;
      if (GM.combo > GM.bestCombo) GM.bestCombo = GM.combo;
      if (GM.combo > 1) {
        showToast(`x${GM.combo} COMBO!`);
        audio.playSfx('combo');
      }
      audio.playSfx('goal');
      spawnParticles(GM.ballX + tableGroup.position.x, 1.2, GM.ballZ + tableGroup.position.z, 0x00ff88, 25);
      setPanelText('goal', 'scorer-text', 'GOAL!');
      setPanelText('goal', 'score-text', `${GM.playerScore} - ${GM.aiScore}`);
      setState('goal');
      GM.resetBall();
      resetAllRods();
      checkAchievements();
      checkMatchEnd();
      return;
    } else {
      GM.ballZ = -halfL;
      GM.ballVZ = Math.abs(GM.ballVZ) * 0.9;
      audio.playSfx('wall');
    }
  }

  // Player-ball collision for all rods
  checkRodBallCollisions(playerRods);
  checkRodBallCollisions(aiRods);

  // Friction
  GM.ballVX *= BALL_FRICTION;
  GM.ballVZ *= BALL_FRICTION;

  // Clamp speed
  const speed = Math.sqrt(GM.ballVX * GM.ballVX + GM.ballVZ * GM.ballVZ);
  if (speed > BALL_MAX_SPEED) {
    GM.ballVX = (GM.ballVX / speed) * BALL_MAX_SPEED;
    GM.ballVZ = (GM.ballVZ / speed) * BALL_MAX_SPEED;
  }

  updateBallPosition();
  // Ball spin visual
  const spinSpeed = speed * 5;
  ballMesh.rotation.x += GM.ballVZ * delta * 10;
  ballMesh.rotation.z -= GM.ballVX * delta * 10;
}

function checkRodBallCollisions(rods: Rod[]) {
  for (const rod of rods) {
    const rodZ = rod.zPos;
    const distZ = Math.abs(GM.ballZ - rodZ);
    if (distZ > PLAYER_R * 2 + BALL_R) continue;

    for (let i = 0; i < rod.playerCount; i++) {
      const xOffset = rod.playerCount === 1 ? 0 : (i - (rod.playerCount - 1) / 2) * rod.playerSpacing;
      const playerX = rod.slidePos * (TABLE_W / 2 - 0.3) + xOffset;
      const distX = Math.abs(GM.ballX - playerX);

      if (distX < PLAYER_R + BALL_R && distZ < PLAYER_R + BALL_R) {
        // Collision!
        const kickActive = Math.abs(rod.kickSpeed) > 1.0;
        const basePower = kickActive ? KICK_FORCE : 2.0;
        const power = (GM.activePowerUp === 'power_kick' && rod.isPlayer) ? basePower * 2 : basePower;
        const direction = rod.isPlayer ? -1 : 1; // Toward opponent goal

        // Deflection based on hit position
        const hitOffset = (GM.ballX - playerX) / (PLAYER_R + BALL_R);
        GM.ballVX = hitOffset * power * 0.7;
        GM.ballVZ = direction * power;

        // Push ball out of collision
        if (GM.ballZ > rodZ) GM.ballZ = rodZ + PLAYER_R + BALL_R + 0.01;
        else GM.ballZ = rodZ - PLAYER_R - BALL_R - 0.01;

        audio.playSfx(kickActive ? 'kick' : 'hit');
        if (kickActive && rod.isPlayer) GM.shots++;

        // Save detection (GK rod blocking shot toward own goal)
        if (!rod.isPlayer && rod === aiRods[0] && Math.abs(rod.kickSpeed) < 0.5) {
          // AI GK blocked a shot
        }
        if (rod.isPlayer && rod === playerRods[0]) {
          GM.saves++;
          audio.playSfx('save');
        }
        return;
      }
    }
  }
}

function checkMatchEnd() {
  const target = GM.goalTarget;
  if (GM.playerScore >= target || GM.aiScore >= target) {
    if (GM.state !== 'gameover') setState('gameover');
  }
}

// ========== AI SYSTEM ==========
function updateAI(delta: number) {
  if (GM.state !== 'playing') return;
  if (GM.freezeAI) return; // Power-up: AI frozen
  const speed = GM.aiSpeedMult;
  const personality = AI_PERSONALITIES[GM.aiPersonality];
  const ballX = GM.ballX;
  const ballZ = GM.ballZ;
  const ballVZ = GM.ballVZ;

  for (let ri = 0; ri < aiRods.length; ri++) {
    const rod = aiRods[ri];
    const rodZ = rod.zPos;
    const distToBall = Math.abs(ballZ - rodZ);
    const isGK = ri === 0;

    let targetX = ballX;
    if (ballVZ < 0 && ballZ > rodZ) {
      const timeToReach = (ballZ - rodZ) / (-ballVZ);
      targetX = ballX + GM.ballVX * timeToReach;
      // Aggressive AI adds forward bias to attack positioning
      if (!isGK) targetX += personality.forwardBias * 0.3;
      targetX = Math.max(-TABLE_W / 2 + 0.3, Math.min(TABLE_W / 2 - 0.3, targetX));
    } else if (personality.forwardBias < 0 && !isGK) {
      // Defensive AI centers idle rods
      targetX *= 0.5;
    }

    const targetSlide = targetX / (TABLE_W / 2 - 0.3);
    const aiSlideSpeed = (1.5 + speed * personality.slideSpeed) * delta;
    const diff = targetSlide - rod.slidePos;
    if (Math.abs(diff) > 0.02) {
      rod.slidePos += Math.sign(diff) * Math.min(Math.abs(diff), aiSlideSpeed);
    }
    rod.slidePos = Math.max(-1, Math.min(1, rod.slidePos));

    // GK reaction enhanced by personality
    const gkBonus = isGK ? personality.gkReaction : 1.0;

    // AI kick when ball is near
    const kickRange = isGK ? 0.4 : 0.3;
    if (distToBall < kickRange && ballVZ < 0.5) {
      for (let i = 0; i < rod.playerCount; i++) {
        const xOffset = rod.playerCount === 1 ? 0 : (i - (rod.playerCount - 1) / 2) * rod.playerSpacing;
        const px = rod.slidePos * (TABLE_W / 2 - 0.3) + xOffset;
        if (Math.abs(px - ballX) < PLAYER_R * 2 + BALL_R && Math.abs(ballZ - rodZ) < PLAYER_R * 3) {
          const kickChance = (personality.kickRate + speed * 0.3) * gkBonus * delta * 10;
          if (rod.kickSpeed === 0 && Math.random() < kickChance) {
            rod.kickSpeed = 15 + speed * 5;
          }
        }
      }
    }

    // Reactive AI mirrors player rod selection
    if (GM.aiPersonality === 'reactive' && !isGK) {
      const mirrorRod = playerRods[3 - ri]; // Mirror corresponding rod
      if (mirrorRod) {
        const mirrorInfluence = 0.3;
        rod.slidePos += (mirrorRod.slidePos - rod.slidePos) * mirrorInfluence * delta;
      }
    }
  }
}

// ========== UI SYSTEM ==========
class FoosballUISystem extends createSystem({
  title: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/title.json')] },
  modeselect: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/modeselect.json')] },
  difficulty: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/difficulty.json')] },
  pause: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
  gameover: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/gameover.json')] },
  leaderboard: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/leaderboard.json')] },
  achievements: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
  settings: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  help: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/help.json')] },
  stats: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
  skins: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/skins.json')] },
  actions: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/actions.json')] },
  goal: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/goal.json')] },
}) {
  init() {
    const wireBtn = (query: string, panel: string, id: string, fn: () => void) => {
      (this.queries as any)[query].subscribe('qualify', (entity: any) => {
        const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
        if (!doc) return;
        panelDocs[panel] = doc;
        const btn = doc.getElementById(id) as any;
        btn?.addEventListener('click', () => { audio.init(); audio.playSfx('click'); fn(); });
      });
    };

    // Title buttons
    this.queries.title.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      panelDocs['title'] = doc;
      const btns: [string, () => void][] = [
        ['btn-play', () => setState('modeselect')],
        ['btn-modes', () => setState('modeselect')],
        ['btn-scores', () => setState('leaderboard')],
        ['btn-achievements', () => setState('achievements')],
        ['btn-stats', () => setState('stats')],
        ['btn-skins', () => setState('skins')],
        ['btn-settings', () => setState('settings')],
        ['btn-help', () => setState('help')],
      ];
      btns.forEach(([id, fn]) => {
        const btn = doc.getElementById(id) as any;
        btn?.addEventListener('click', () => { audio.init(); audio.playSfx('click'); fn(); });
      });
    });

    // Mode select
    this.queries.modeselect.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      panelDocs['modeselect'] = doc;
      const modes: [string, GameMode][] = [
        ['btn-quick', 'quick'], ['btn-classic', 'classic'], ['btn-timed', 'timed'],
        ['btn-tournament', 'tournament'], ['btn-daily', 'daily'], ['btn-survival', 'survival'],
        ['btn-speed', 'speed'], ['btn-practice', 'practice'],
      ];
      modes.forEach(([id, mode]) => {
        const btn = doc.getElementById(id) as any;
        btn?.addEventListener('click', () => { audio.init(); audio.playSfx('click'); GM.mode = mode; setState('difficulty'); });
      });
      const back = doc.getElementById('btn-back') as any;
      back?.addEventListener('click', () => { audio.playSfx('click'); setState('title'); });
    });

    // Difficulty
    this.queries.difficulty.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      panelDocs['difficulty'] = doc;
      const diffs: [string, Difficulty][] = [['btn-easy', 'easy'], ['btn-medium', 'medium'], ['btn-hard', 'hard']];
      diffs.forEach(([id, diff]) => {
        const btn = doc.getElementById(id) as any;
        btn?.addEventListener('click', () => { audio.init(); audio.playSfx('click'); GM.difficulty = diff; setState('countdown'); });
      });
      const back = doc.getElementById('btn-back') as any;
      back?.addEventListener('click', () => { audio.playSfx('click'); setState('modeselect'); });
    });

    // Pause
    this.queries.pause.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      panelDocs['pause'] = doc;
      (doc.getElementById('btn-resume') as any)?.addEventListener('click', () => { audio.playSfx('click'); setState('playing'); });
      (doc.getElementById('btn-quit') as any)?.addEventListener('click', () => { audio.playSfx('click'); setState('title'); });
    });

    // Game Over
    this.queries.gameover.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      panelDocs['gameover'] = doc;
      (doc.getElementById('btn-rematch') as any)?.addEventListener('click', () => { audio.playSfx('click'); setState('countdown'); });
      (doc.getElementById('btn-menu') as any)?.addEventListener('click', () => { audio.playSfx('click'); setState('title'); });
    });

    // Back buttons for info panels
    ['leaderboard', 'achievements', 'help', 'stats', 'skins'].forEach(panel => {
      (this.queries as any)[panel].subscribe('qualify', (entity: any) => {
        const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
        if (!doc) return;
        panelDocs[panel] = doc;
        (doc.getElementById('btn-back') as any)?.addEventListener('click', () => { audio.playSfx('click'); setState('title'); });
      });
    });

    // Achievements pagination
    this.queries.achievements.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      (doc.getElementById('btn-prev') as any)?.addEventListener('click', () => {
        if (GM.achPage > 0) { GM.achPage--; updateAchievementsPanel(); }
      });
      (doc.getElementById('btn-next') as any)?.addEventListener('click', () => {
        const maxPage = Math.ceil(ACHIEVEMENTS.length / 15) - 1;
        if (GM.achPage < maxPage) { GM.achPage++; updateAchievementsPanel(); }
      });
    });

    // Settings
    this.queries.settings.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      panelDocs['settings'] = doc;
      (doc.getElementById('btn-sfx-down') as any)?.addEventListener('click', () => { GM.sfxVol = Math.max(0, GM.sfxVol - 10); audio.updateVolumes(); updateSettingsPanel(); });
      (doc.getElementById('btn-sfx-up') as any)?.addEventListener('click', () => { GM.sfxVol = Math.min(100, GM.sfxVol + 10); audio.updateVolumes(); updateSettingsPanel(); });
      (doc.getElementById('btn-music-down') as any)?.addEventListener('click', () => { GM.musicVol = Math.max(0, GM.musicVol - 10); audio.updateVolumes(); updateSettingsPanel(); });
      (doc.getElementById('btn-music-up') as any)?.addEventListener('click', () => { GM.musicVol = Math.min(100, GM.musicVol + 10); audio.updateVolumes(); updateSettingsPanel(); });
      (doc.getElementById('btn-theme-prev') as any)?.addEventListener('click', () => { GM.themeIdx = (GM.themeIdx - 1 + THEMES.length) % THEMES.length; updateSettingsPanel(); });
      (doc.getElementById('btn-theme-next') as any)?.addEventListener('click', () => { GM.themeIdx = (GM.themeIdx + 1) % THEMES.length; updateSettingsPanel(); });
      (doc.getElementById('btn-back') as any)?.addEventListener('click', () => { audio.playSfx('click'); GM.save(); setState('title'); });
    });

    // Skins
    this.queries.skins.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      for (let i = 0; i < 8; i++) {
        const btn = doc.getElementById(`skin${i}`) as any;
        btn?.addEventListener('click', () => {
          if (GM.skinUnlocked.has(i)) { GM.skinIdx = i; audio.playSfx('click'); updateSkinsPanel(); GM.save(); }
        });
      }
    });

    // Actions panel
    this.queries.actions.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      panelDocs['actions'] = doc;
      for (let i = 0; i < 4; i++) {
        const btn = doc.getElementById(`btn-rod${i + 1}`) as any;
        btn?.addEventListener('click', () => { GM.selectedRod = i; updateSelectedIndicator(); updateHUD(); audio.playSfx('click'); });
      }
      (doc.getElementById('btn-kick') as any)?.addEventListener('click', () => {
        if (GM.state === 'playing') performKick();
      });
    });

    // Goal panel
    this.queries.goal.subscribe('qualify', (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      panelDocs['goal'] = doc;
    });
  }
}

function performKick() {
  const rod = playerRods[GM.selectedRod];
  if (rod && rod.kickSpeed === 0) {
    rod.kickSpeed = 20;
    audio.playSfx('kick');
  }
}

// ========== GAME LOOP SYSTEM ==========
class FoosballGameSystem extends createSystem({}) {
  update(delta: number) {
    // Clamp delta
    const dt = Math.min(delta, 0.05);

    // Countdown
    if (GM.state === 'countdown') {
      GM.countdownTimer += dt;
      if (GM.countdownTimer >= 1.0) {
        GM.countdownTimer = 0;
        GM.countdownVal--;
        if (GM.countdownVal > 0) {
          setPanelText('countdown', 'countdown-text', `${GM.countdownVal}`);
          audio.playSfx('countdown');
        } else {
          setPanelText('countdown', 'countdown-text', 'KICK OFF!');
          audio.playSfx('go');
          setTimeout(() => setState('playing'), 500);
        }
      }
    }

    // Goal display
    if (GM.state === 'goal') {
      GM.goalDisplayTimer -= dt;
      if (GM.goalDisplayTimer <= 0) {
        // Check if match is over
        if (GM.playerScore >= GM.goalTarget || GM.aiScore >= GM.goalTarget) {
          setState('gameover');
        } else {
          setState('countdown');
        }
      }
    }

    // Playing
    if (GM.state === 'playing') {
      GM.matchTime += dt;

      // Timed mode
      if (GM.mode === 'timed') {
        GM.timeLeft -= dt;
        if (GM.timeLeft <= 0) { GM.timeLeft = 0; setState('gameover'); return; }
      }

      // Survival mode
      if (GM.mode === 'survival') {
        GM.survivalTime += dt;
        if (GM.aiScore >= 3) { setState('gameover'); return; }
      }

      // Combo decay
      if (GM.comboTimer > 0) {
        GM.comboTimer -= dt;
        if (GM.comboTimer <= 0) GM.combo = 0;
      }

      // Ball physics
      updateBallPhysics(dt);

      // Power-ups
      updatePowerUps(dt);

      // Ball trail
      GM.ballTrailPositions.forEach(p => p.age += dt);
      updateBallTrail();

      // AI
      updateAI(dt);

      // Rod kick animation
      [...playerRods, ...aiRods].forEach(rod => {
        if (rod.kickSpeed > 0) {
          rod.kickAngle += rod.kickSpeed * dt;
          rod.kickSpeed *= 0.9;
          if (rod.kickSpeed < 0.5) { rod.kickSpeed = 0; rod.kickAngle = 0; }
          // Animate player figures
          rod.players.forEach(p => {
            (p as unknown as Group).rotation.x = Math.sin(rod.kickAngle) * 0.8;
          });
        }
      });

      // Update rod positions
      playerRods.forEach(rod => {
        rod.group.position.x = rod.slidePos * (TABLE_W / 2 - 0.3);
      });
      aiRods.forEach(rod => {
        rod.group.position.x = rod.slidePos * (TABLE_W / 2 - 0.3);
      });

      // Keyboard input
      const kb = (world.input as any).keyboard as any;
      if (kb) {
        // Rod selection
        if (kb.getKeyPressed?.('Digit1') || kb.getKeyDown?.('Digit1')) GM.selectedRod = 0;
        if (kb.getKeyPressed?.('Digit2') || kb.getKeyDown?.('Digit2')) GM.selectedRod = 1;
        if (kb.getKeyPressed?.('Digit3') || kb.getKeyDown?.('Digit3')) GM.selectedRod = 2;
        if (kb.getKeyPressed?.('Digit4') || kb.getKeyDown?.('Digit4')) GM.selectedRod = 3;

        // Slide rod
        const rod = playerRods[GM.selectedRod];
        if (rod) {
          const slideSpeed = 2.5 * dt;
          if (kb.getKeyPressed?.('KeyA') || kb.getKeyPressed?.('ArrowLeft')) {
            rod.slidePos = Math.max(-1, rod.slidePos - slideSpeed);
          }
          if (kb.getKeyPressed?.('KeyD') || kb.getKeyPressed?.('ArrowRight')) {
            rod.slidePos = Math.min(1, rod.slidePos + slideSpeed);
          }
        }

        // Kick
        if (kb.getKeyDown?.('Space')) performKick();

        // Pause
        if (kb.getKeyDown?.('Escape') || kb.getKeyDown?.('KeyP')) setState('paused');

        updateSelectedIndicator();
      }

      // XR controller input
      try {
        const left = (world.input as any).xr.gamepads.left;
        const right = (world.input as any).xr.gamepads.right;
        if (left) {
          const stick = left.getAxesValues(InputComponent.Thumbstick);
          if (stick && Math.abs(stick.x) > 0.1) {
            const rod = playerRods[GM.selectedRod];
            if (rod) rod.slidePos = Math.max(-1, Math.min(1, rod.slidePos + stick.x * 2.5 * dt));
          }
        }
        if (right) {
          if (right.getButtonDown(InputComponent.Trigger)) performKick();
          if (right.getButtonDown(InputComponent.B_Button)) setState('paused');
          if (right.getButtonDown(InputComponent.A_Button)) {
            GM.selectedRod = (GM.selectedRod + 1) % 4;
            updateSelectedIndicator();
            updateHUD();
          }
        }
      } catch {}

      updateHUD();
    }

    // Paused keyboard
    if (GM.state === 'paused') {
      const kb = (world.input as any).keyboard as any;
      if (kb?.getKeyDown?.('Escape') || kb?.getKeyDown?.('KeyP')) setState('playing');
    }

    // Title/gameover keyboard
    if (GM.state === 'gameover') {
      const kb = (world.input as any).keyboard as any;
      if (kb?.getKeyDown?.('KeyR')) setState('countdown');
    }

    // Particles
    updateParticles(dt);

    // Toast
    processToast(dt);

    // Floating decoration animation
    for (const deco of floatingDecos) {
      const ud = deco.userData;
      deco.rotation.y += ud.rotSpeed * dt;
      deco.rotation.x += ud.rotSpeed * 0.3 * dt;
      deco.position.y = ud.baseY + Math.sin(performance.now() * 0.001 * ud.bobSpeed) * ud.bobAmp;
    }

    // Goal glow pulse
    const pulse = 0.3 + Math.sin(performance.now() * 0.003) * 0.2;
    (playerGoalGlow.material as MeshBasicMaterial).opacity = pulse;
    (aiGoalGlow.material as MeshBasicMaterial).opacity = pulse;

    // Selected rod indicator pulse
    (selectedIndicator.material as MeshBasicMaterial).opacity = 0.4 + Math.sin(performance.now() * 0.005) * 0.3;
    selectedIndicator.rotation.z += 2 * dt;
  }
}

// ========== REGISTER & START ==========
world.registerSystem(FoosballUISystem);
world.registerSystem(FoosballGameSystem);
setState('title');
