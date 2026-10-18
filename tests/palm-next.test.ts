import {it,expect} from 'vitest';
import {PalmDwellSelector} from '../src/motion/hands';
it('selects a marked target after 900ms with an open palm',()=>{const p=new PalmDwellSelector();expect(p.update('next',true,100)).toBe(null);expect(p.update('next',true,900)).toBe(null);expect(p.update('next',true,1000)).toBe('next');});
it('requires leaving before activating the next tutorial screen',()=>{const p=new PalmDwellSelector();p.update('next',true,0);p.update('next',true,900);expect(p.update('new-next',true,3000)).toBe(null);p.update(null,true,3050);p.update('new-next',true,3100);expect(p.update('new-next',true,4000)).toBe('new-next');});
it('cancels interrupted dwell and accepts neither a fist nor an unmarked target',()=>{const p=new PalmDwellSelector();p.update('next',true,0);expect(p.update('next',false,800)).toBe(null);expect(p.update('next',true,1000)).toBe(null);expect(p.update(null,true,3000)).toBe(null);});
it('blocks palm reactivation after the same button is selected by a fist',()=>{const p=new PalmDwellSelector();p.consume();expect(p.update('next',true,100)).toBe(null);expect(p.update('next',true,2000)).toBe(null);});
