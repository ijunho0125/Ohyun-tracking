import {it,expect} from 'vitest';
import {tutorialAdvance} from '../src/components/Experiences';
const input={tracked:true,shape:'open' as const,armed:true,moved:false,inside:false,selected:false};
it('does not advance by elapsed time, a mouse click, a closed initial hand or missing tracking',()=>{
  expect(tutorialAdvance(0,{...input,tracked:false})).toBe(0);expect(tutorialAdvance(0,{...input,shape:'fist'})).toBe(0);
  expect(tutorialAdvance(1,{...input,inside:true})).toBe(1);expect(tutorialAdvance(2,input)).toBe(2);expect(tutorialAdvance(3,{...input,armed:false})).toBe(3);
});
it('advances only through tracked open hand, actual cursor travel, motion selection and confirmed release',()=>{
  expect(tutorialAdvance(0,input)).toBe(1);expect(tutorialAdvance(1,{...input,moved:true,inside:true})).toBe(2);expect(tutorialAdvance(2,{...input,shape:'fist',selected:true})).toBe(3);expect(tutorialAdvance(3,input)).toBe(4);
});
