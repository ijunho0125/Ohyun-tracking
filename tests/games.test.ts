import { describe, expect, it, vi } from 'vitest';
import { defaults, type GameEvent } from '../src/core/types';
import { BalanceGame } from '../src/games/engines';
import { SourceGame } from '../src/games/source-games';

function sourceFixture(id: 'dino' | 'tetris') {
  const events: GameEvent[] = [];
  const snapshot = { state: 'idle', score: 0, grounded: true };
  const api = {
    start: vi.fn(), pause: vi.fn(), resume: vi.fn(), reset: vi.fn(),
    command: vi.fn(), release: vi.fn(), advance: vi.fn(),
    snapshot: () => snapshot,
    practice: vi.fn(), sound: vi.fn(), configure: vi.fn(), dispose: vi.fn(),
  };
  const frame = { contentWindow: { motionGame: api } } as unknown as HTMLIFrameElement;
  const game = new SourceGame(id, defaults, event => events.push(event));
  game.attach(frame);
  return { game, api, frame, events, snapshot };
}

// Exercise the adapters used by the UI. The browser suite checks the original
// HTML games' physics and board rules through the same bridge.
describe.each(['dino', 'tetris'] as const)('%s source adapter', id => {
  it('prepares, starts, pauses, resumes, restarts and disposes', () => {
    const { game, api } = sourceFixture(id);
    expect(game.state).toBe('ready');
    game.prepare();
    game.start();
    expect(api.start).toHaveBeenCalledWith('EASY');
    expect(game.state).toBe('running');
    game.pause();
    expect(game.state).toBe('paused');
    expect(api.pause).toHaveBeenCalledOnce();
    game.resume();
    expect(game.state).toBe('running');
    expect(api.resume).toHaveBeenCalledOnce();
    game.finish();
    expect(game.state).toBe('over');
    game.restart();
    expect(game.state).toBe('ready');
    expect(game.score).toBe(0);
    game.dispose();
    game.start();
    game.restart();
    expect(game.state).toBe('disposed');
    expect(api.dispose).toHaveBeenCalledOnce();
  });

  it('configures the attached game and forwards the selected difficulty and scene', () => {
    const { game, api } = sourceFixture(id);
    expect(api.configure).toHaveBeenCalledWith(defaults, 'day');
    game.scene = 'beach';
    game.configure();
    expect(api.configure).toHaveBeenLastCalledWith(defaults, 'beach');
    game.mode = 'HARD';
    game.start();
    expect(api.start).toHaveBeenCalledWith('HARD');
  });

  it('only forwards commands while running and releases held input', () => {
    const { game, api } = sourceFixture(id);
    const command = { type: 'jump' } as const;
    game.command(command);
    expect(api.command).not.toHaveBeenCalled();
    game.start();
    game.command(command);
    expect(api.command).toHaveBeenCalledExactlyOnceWith(command);
    game.release();
    expect(api.release).toHaveBeenCalledOnce();
    game.pause();
    game.command(command);
    expect(api.command).toHaveBeenCalledOnce();
  });

  it('reports score changes and game over once, and tracks grounded state', () => {
    const { game, snapshot, events } = sourceFixture(id);
    game.start();
    snapshot.score = 42;
    snapshot.grounded = false;
    game.update(1 / 60);
    game.update(1 / 60);
    expect(game.score).toBe(42);
    expect(game.grounded).toBe(false);
    expect(events).toEqual([{ type: 'score', score: 42 }]);
    snapshot.state = 'gameover';
    game.update(1 / 60);
    game.update(1 / 60);
    game.finish();
    expect(game.state).toBe('over');
    expect(events.filter(event => event.type === 'over')).toEqual([{ type: 'over', score: 42 }]);
  });

  it('updates practice styling only on changes and when attaching a new document', () => {
    const { game, api, frame } = sourceFixture(id);
    game.practicing = true;
    game.start();
    for (let i = 0; i < 120; i++) game.update(1 / 60);
    expect(api.advance).toHaveBeenCalledTimes(120);
    expect(api.practice).toHaveBeenCalledExactlyOnceWith(true);
    game.practicing = false;
    game.update(1 / 60);
    expect(api.practice).toHaveBeenCalledTimes(2);
    expect(api.practice).toHaveBeenLastCalledWith(false);
    game.attach(frame);
    game.update(1 / 60);
    expect(api.practice).toHaveBeenCalledTimes(3);
  });

  it('ignores updates after disposal and cannot start without a bridge', () => {
    const { game, api } = sourceFixture(id);
    game.dispose();
    game.update(1);
    expect(api.advance).not.toHaveBeenCalled();
    const detached = new SourceGame(id, defaults);
    expect(detached.attach({ contentWindow: null } as HTMLIFrameElement)).toBe(false);
    detached.start();
    expect(detached.state).toBe('ready');
  });
});

describe('balance game', () => {
  it('preserves its lifecycle and ignores updates while paused or disposed', () => {
    const game = new BalanceGame();
    expect(game.state).toBe('ready');
    game.start();
    game.update(.1);
    game.pause();
    const score = game.score;
    game.update(2);
    expect(game.score).toBe(score);
    game.resume();
    expect(game.state).toBe('running');
    game.finish();
    expect(game.state).toBe('over');
    game.restart();
    expect(game.state).toBe('ready');
    expect(game.score).toBe(0);
    game.dispose();
    game.start();
    game.update(2);
    expect(game.state).toBe('disposed');
    expect(game.score).toBe(0);
  });

  it('limits plank angle and ends when the ball leaves the plank', () => {
    const game = new BalanceGame();
    game.start();
    game.command({ type: 'tilt', value: 100 });
    for (let i = 0; i < 1000 && game.state === 'running'; i++) game.update(.01);
    expect(game.angle).toBeLessThanOrEqual(.38);
    expect(game.x).toBeGreaterThan(274);
    expect(game.state).toBe('over');
    expect(game.score).toBeGreaterThan(0);
  });

  it('releases tilt on pause', () => {
    const game = new BalanceGame();
    game.start();
    game.command({ type: 'tilt', value: .25 });
    game.pause();
    expect(game.target).toBe(0);
  });
});
