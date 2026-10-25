import { Howl, Howler } from 'howler';
import { assetUrl } from '../domain/content';
let enabled = false;
let current: Howl | undefined;
let settleCurrent: ((success: boolean) => void) | undefined;
let generation = 0;
let cancelSpeech: (() => void) | undefined;
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
    const token = generation;
    void Howler.ctx?.resume().catch(() => { if (enabled && token === generation) report('点“重听”再开启声音。'); });
  },
  stop() {
    generation++;
    cancelSpeech?.(); cancelSpeech = undefined;
    // Howler queues stop during loading; unloading need not emit onstop.
    // Settle our queue explicitly before destroying the pending clip.
    settleCurrent?.(false);
    settleCurrent = undefined;
    const clip = current;
    current = undefined;
    clip?.stop(); clip?.unload(); report('');
  },
  feedback(text: string, fallback: string[], preferClips = false) {
    this.stop();
    if (!enabled || document.hidden) return;
    // Only an installed local Chinese voice may read these fixed game phrases.
    // Devices without one keep the bundled clips; no speech service is called.
    const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis;
    const voice = !preferClips && synth?.getVoices().find(v => v.localService && /^zh[-_]/i.test(v.lang));
    if (!synth || !voice || typeof SpeechSynthesisUtterance === 'undefined') {void this.play(...fallback); return;}
    const token = generation, utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = .88; utterance.volume = .85;
    let timer: ReturnType<typeof setTimeout>;
    const fail = () => {if (token === generation) void this.play(...fallback);};
    utterance.onstart = () => clearTimeout(timer);
    utterance.onend = () => {clearTimeout(timer);if (token === generation) cancelSpeech = undefined;};
    utterance.onerror = fail;
    cancelSpeech = () => {clearTimeout(timer);synth.cancel();};
    timer = setTimeout(fail, 2000);
    try {synth.speak(utterance);} catch {fail();}
  },
  async play(...ids: string[]) {
    this.stop();
    if (!enabled || document.hidden) return;
    const token = generation;
    report('');
    for (const id of ids) {
      if (token !== generation || !enabled) return;
      const success = await new Promise<boolean>(resolve => {
        const settle = (success: boolean) => {
          if (settleCurrent === settle) settleCurrent = undefined;
          resolve(success);
        };
        settleCurrent = settle;
        const clip = new Howl({ src: [assetUrl(id)], volume: 0.85, preload: true,
          onend: () => settle(true), onstop: () => settle(false),
          onloaderror: () => { if (token === generation) report('声音还没到，点“重听”再试一次。'); settle(false); },
          onplayerror: () => { if (token === generation) report('声音暂时没播放，点“重听”再试一次。'); settle(false); },
        });
        current = clip;
        void Howler.ctx?.resume().catch(() => {
          if (token !== generation) return;
          report('声音暂时没播放，点“重听”再试一次。');
          settle(false);
        });
        clip.play();
      });
      if (token !== generation) return;
      const clip = current;
      current = undefined;
      clip?.unload();
      if (!success) break;
    }
  },
};
