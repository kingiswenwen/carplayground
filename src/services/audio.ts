import { Howl, Howler } from 'howler';
import { assetUrl } from '../domain/content';
let enabled = false;
let current: Howl | undefined;
let generation = 0;
let error = '';
const listeners = new Set<() => void>();
function report(message: string) { error = message; listeners.forEach(fn => fn()); }
export const audio = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getError: () => error,
  setEnabled(value: boolean, unlock = false) {
    enabled = value;
    if (!value) { this.stop(); return; }
    if (!unlock) return;
    // Initialize/resume in the original click handler, before hash navigation
    // or async loading can leave Safari's user-gesture task.
    Howler.volume(1);
    void Howler.ctx?.resume().catch(() => report('点“重听”再开启声音。'));
  },
  stop() { generation++; current?.stop(); current?.unload(); current = undefined; report(''); },
  async play(...ids: string[]) {
    this.stop();
    if (!enabled || document.hidden) return;
    const token = generation;
    report('');
    for (const id of ids) {
      if (token !== generation || !enabled) return;
      const success = await new Promise<boolean>(resolve => {
        const clip = new Howl({ src: [assetUrl(id)], volume: 0.85, preload: true,
          onend: () => resolve(true), onstop: () => resolve(false),
          onloaderror: () => { if (token === generation) report('声音还没到，点“重听”再试一次。'); resolve(false); },
          onplayerror: () => { if (token === generation) report('声音暂时没播放，点“重听”再试一次。'); resolve(false); },
        });
        current = clip;
        void Howler.ctx?.resume();
        clip.play();
      });
      if (token !== generation) return;
      current?.unload();
      if (!success) break;
    }
  },
};
