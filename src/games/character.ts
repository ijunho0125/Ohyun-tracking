export type AnimationState = 'run' | 'jump' | 'air' | 'land' | 'duck' | 'over';
export const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 122"><path d="M32 91Q13 94 10 70L32 77V59Q30 34 55 31L58 13Q60 8 65 15L73 30L88 16Q94 14 92 23L89 33Q110 39 106 60L103 78L84 80L82 107L93 112L93 119L67 119L66 98L55 98L52 119L29 119L29 111L38 106Z" fill="#fd7122" stroke="#49241c" stroke-width="4" stroke-linejoin="round"/><circle cx="87" cy="47" r="4" fill="#49241c"/><path d="M94 61H104M58 73L73 79L79 70" fill="none" stroke="#49241c" stroke-width="4" stroke-linecap="round"/><circle cx="94" cy="55" r="5" fill="#f3e9d2" opacity=".8"/></svg>`;
export const defaultImage = () => { const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_SVG)}`; return img; };
export function deformation(state: AnimationState, t: number, strength = 1) {
  let x = 1, y = 1, rotation = 0, bob = 0;
  if (state === 'run') { const pulse = Math.sin(t * 17); x += pulse * .055 * strength; y -= pulse * .07 * strength; bob = -Math.abs(Math.sin(t * 8.5)) * 3 * strength; }
  if (state === 'jump') { x -= .14 * strength; y += .22 * strength; }
  if (state === 'air') rotation = -.08 * strength;
  if (state === 'land') { const k = Math.max(0, 1 - t / .23); x += k * .24 * strength; y -= k * .24 * strength; }
  if (state === 'duck') { x += .22; y = .53; }
  if (state === 'over') { x += .16 * strength; y -= .16 * strength; rotation = -.2; }
  return { x, y, rotation, bob };
}
export type CharacterVisual = { image: HTMLImageElement; flip: boolean; footX: number; footY: number; size: number; strength: number };
export function drawCharacter(ctx: CanvasRenderingContext2D, visual: CharacterVisual, x: number, footY: number, state: AnimationState, t: number, height = 83) {
  const img = visual.image; if (!img.complete || !img.naturalWidth) return;
  const scale = height / Math.max(img.naturalWidth, img.naturalHeight) * visual.size;
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale, d = deformation(state, t, visual.strength);
  ctx.save(); ctx.translate(x, footY + d.bob); ctx.rotate(d.rotation); ctx.scale(d.x * (visual.flip ? -1 : 1), d.y);
  ctx.drawImage(img, -w * visual.footX, -h * visual.footY, w, h); ctx.restore();
}


