// Phaser 4.2.1 (MIT, Phaser Studio Inc.) leaves its document visibility
// listener installed after Game.destroy(). Patch only the bundled ESM module
// at build/serve time, without mutating node_modules or global browser APIs.
const oldHandlers = `    window.onblur = function ()
    {
        eventEmitter.emit(Events.BLUR);
    };

    window.onfocus = function ()
    {
        eventEmitter.emit(Events.FOCUS);
    };`;

const ownedHandlers = `    var onBlur = function ()
    {
        eventEmitter.emit(Events.BLUR);
    };

    var onFocus = function ()
    {
        eventEmitter.emit(Events.FOCUS);
    };

    window.addEventListener('blur', onBlur, false);
    window.addEventListener('focus', onFocus, false);
    eventEmitter.once(Events.DESTROY, function ()
    {
        if (hiddenVar)
        {
            document.removeEventListener(hiddenVar, onChange, false);
        }
        window.removeEventListener('blur', onBlur, false);
        window.removeEventListener('focus', onFocus, false);
    });`;

export function patchPhaserVisibility(source: string, version: string) {
  if (version !== '4.2.1') throw new Error('Recheck Phaser visibility cleanup before changing its pinned version');
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.includes('var VisibilityHandler = function (game)') || normalized.split(oldHandlers).length !== 2) {
    throw new Error('Phaser visibility source changed; refusing to silently skip cleanup');
  }
  return normalized.replace(oldHandlers, ownedHandlers);
}
