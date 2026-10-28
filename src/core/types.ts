export type GameId = 'dino' | 'tetris' | 'balance';
export type Page = 'lobby' | 'game' | 'character' | 'tutorial' | 'lab';
export type GameState = 'ready' | 'running' | 'paused' | 'over' | 'disposed';
export type MotionMode = 'hand' | 'pose' | 'tetris';
export type Command = { type: 'jump' | 'rotate' | 'hardDrop' } | { type: 'duck' | 'softDrop'; value: boolean } | { type: 'move' | 'tilt'; value: number };
export type GameEvent = { type: 'ready' | 'over'; score: number } | { type: 'score'; score: number };
export type Landmark = { x: number; y: number; z?: number; visibility?: number; presence?: number };
export type Hand = { side: 'Left' | 'Right'; points: Landmark[]; confidence: number };
export type MotionFrame = { hands: Hand[]; pose: Landmark[]; time: number; width: number; height: number; inferenceMs: number };
export type Settings = { hand: 'Left' | 'Right'; dinoMode: 'body' | 'seated'; fistHoldMs: number; fistFrames: number; openFrames: number; dwellMs: number; smoothing: number; frequency: number; resolution: number; dinoSpeed: number; obstacleGap: number; deviceId: string; strength: number };
export const defaults: Settings = { hand: 'Right', dinoMode: 'body', fistHoldMs: 180, fistFrames: 3, openFrames: 3, dwellMs: 240, smoothing: .35, frequency: 30, resolution: 640, dinoSpeed: 260, obstacleGap: 1.3, deviceId: '', strength: 1 };
export interface GameAdapter {
  id: GameId; state: GameState; score: number;
  prepare(): void; start(): void; pause(): void; resume(): void; restart(): void; finish(): void; dispose(): void;
  command(command: Command): void; release(): void; update(dt: number): void; render(ctx: CanvasRenderingContext2D): void;
}
export type Character = { id: string; name: string; original: Blob; processed: Blob; flip: boolean; footX: number; footY: number; size: number };
