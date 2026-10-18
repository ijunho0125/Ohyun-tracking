import {it,expect} from 'vitest';
import {removeBackgroundPixels} from '../src/core/images';
it('removes only matching background pixels and preserves the source RGB and other alpha',()=>{const data=new Uint8ClampedArray([255,255,255,255,196,243,107,255,50,50,50,75]);removeBackgroundPixels(data,'#ffffff',5);expect([...data]).toEqual([255,255,255,0,196,243,107,255,50,50,50,75]);});
it('uses the configured tolerance for near-background pixels',()=>{const source=[250,250,250,255],a=new Uint8ClampedArray(source),b=new Uint8ClampedArray(source);removeBackgroundPixels(a,'#ffffff',0);removeBackgroundPixels(b,'#ffffff',5);expect(a[3]).toBe(255);expect(b[3]).toBe(0);});
it('preserves alpha just beyond the color-distance threshold',()=>{const data=new Uint8ClampedArray([44,0,0,200,45,0,0,75]);expect(removeBackgroundPixels(data,'#000000',10)).toBe(data);expect([...data]).toEqual([44,0,0,0,45,0,0,75]);});
