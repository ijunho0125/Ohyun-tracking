import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../src/core/types';
import { loadSettings, persistSettings } from '../src/core/storage';

afterEach(()=>vi.unstubAllGlobals());
function saved(value:unknown) { vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(value),setItem:vi.fn()}); }
describe('motion-friendly settings upgrades',()=>{
  it('upgrades the previous recognition default, while respecting a newly saved slower setting',()=>{
    saved({version:2,frequency:20});expect(loadSettings().frequency).toBe(30);
    saved({version:2,frequency:10});expect(loadSettings().frequency).toBe(10);
    saved({version:3,frequency:20,dinoSpeed:300,obstacleGap:1.75});expect(loadSettings()).toMatchObject({frequency:20,dinoSpeed:300,obstacleGap:1.75});
  });
  it('upgrades previous defaults without changing custom values',()=>{
    saved({dinoSpeed:300,obstacleGap:1.75});expect(loadSettings()).toMatchObject({dinoSpeed:defaults.dinoSpeed,obstacleGap:defaults.obstacleGap});
    saved({dinoSpeed:280,obstacleGap:2.5});expect(loadSettings()).toMatchObject({dinoSpeed:280,obstacleGap:2.5});
  });
  it('preserves an intentional selection of the previous defaults after saving',()=>{
    saved({});persistSettings({...defaults,dinoSpeed:300,obstacleGap:1.75});
    const value=JSON.parse(vi.mocked(localStorage.setItem).mock.calls[0][1]);saved(value);
    expect(loadSettings()).toMatchObject({dinoSpeed:300,obstacleGap:1.75});
  });
  it('bounds imported values and ignores non-finite numbers',()=>{
    saved({version:2,dinoSpeed:900,obstacleGap:-1,dinoMode:'unknown'});
    expect(loadSettings()).toMatchObject({dinoSpeed:380,obstacleGap:1.3,dinoMode:'body'});
    vi.stubGlobal('localStorage',{getItem:()=>'{"dinoSpeed":1e999,"obstacleGap":1e999}'});
    expect(loadSettings()).toMatchObject({dinoSpeed:defaults.dinoSpeed,obstacleGap:defaults.obstacleGap});
  });
});
