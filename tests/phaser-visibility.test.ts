import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import { patchPhaserVisibility } from '../scripts/phaser-visibility';

const original = readFileSync(new URL(import.meta.resolve('phaser')), 'utf8');
describe('pinned Phaser visibility cleanup', () => {
  it('delivers active events, removes only its own handlers on destroy and preserves host handlers', () => {
    const source = patchPhaserVisibility(original, '4.2.1');
    const fn = source.match(/var VisibilityHandler = function \(game\)\n\{[\s\S]*?\n\};/)?.[0];
    if (!fn) throw new Error('Visibility handler missing');
    const document = Object.assign(new EventTarget(), { hidden: false });
    const hostBlur = () => undefined;
    const window = Object.assign(new EventTarget(), { onblur: hostBlur, onfocus: null });
    const events = new EventEmitter(), calls: string[] = [];
    const Events = { HIDDEN: 'hidden', VISIBLE: 'visible', BLUR: 'blur', FOCUS: 'focus', DESTROY: 'destroy' };
    for (const event of ['hidden', 'visible', 'blur', 'focus']) events.on(event, () => calls.push(event));
    runInNewContext(`${fn}\nVisibilityHandler(game);`, { document, window, Events, game: { events, config: { autoFocus: false } } });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(calls).toEqual(['visible', 'blur', 'hidden', 'focus']);
    events.emit('destroy');
    document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus'));
    expect(calls).toHaveLength(4);
    expect(window.onblur).toBe(hostBlur);
  });
  it('fails explicitly for changed versions or sources', () => {
    expect(() => patchPhaserVisibility(original, '4.2.2')).toThrow('Recheck');
    expect(() => patchPhaserVisibility('unexpected source', '4.2.1')).toThrow('source changed');
  });
});
