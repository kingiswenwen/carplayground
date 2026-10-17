import { useEffect, useRef, useState } from 'react';
import { assetUrl, content } from '../domain/content';
import type { ParkingState } from '../domain/parking';
import type PhaserType from 'phaser';

type Props = { state: ParkingState; selected: string | null; paused: boolean;
  select: (car: string) => void; place: (car: string, slot: number) => void; fallback: () => void };
export default function ParkingCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const bridge = useRef<{ render: () => void; game: PhaserType.Game } | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let game: PhaserType.Game | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const onContextLost = (event: Event) => { event.preventDefault(); if (!disposed) latest.current.fallback(); };
    void import('phaser').then(({ default: Phaser }) => {
      if (disposed || !host.current) return;
      class ParkingScene extends Phaser.Scene {
        images: PhaserType.GameObjects.Image[] = [];
        rings: PhaserType.GameObjects.Graphics[] = [];
        preload() {
          this.load.image('parking-world', assetUrl('scene-parking'));
          this.load.image('car-white', assetUrl(content.car.images.white));
          this.load.image('car-blue', assetUrl(content.car.images.blue));
          this.load.once('loaderror', () => { if (!disposed) latest.current.fallback(); });
        }
        create() {
          if (disposed || !game) return;
          this.add.image(480, 300, 'parking-world').setDisplaySize(960, 600);
          const road = this.add.graphics();
          road.fillStyle(0x3d4943, .25); road.fillRoundedRect(80, 150, 800, 120, 15);
          road.lineStyle(3, 0xf5edd6, .85); road.lineBetween(85, 290, 875, 290);
          for(let dash=0;dash<9;dash++){road.fillStyle(0xf2e9c8,.65);road.fillRect(95+dash*86,285,42,5);}
          for (let i = 0; i < 2; i++) {
            const x = 270 + i * 420;
            road.fillStyle(0x34433c, .24); road.fillRoundedRect(x - 175, 340, 350, 205, 10);
            road.lineStyle(5, 0xfff7d9, .95); road.strokeRoundedRect(x - 175, 340, 350, 205, 10);
            road.lineStyle(3, 0xfff7d9, .4);road.lineBetween(x,350,x,375);
            this.add.text(x, 512, `${i + 1}`, { fontFamily: 'sans-serif', fontSize: '32px', color: '#fff7d9' }).setOrigin(0.5);
            const zone = this.add.zone(x, 438, 350, 205).setInteractive();
            zone.on('pointerdown', () => {
              if (!latest.current.paused && latest.current.selected) latest.current.place(latest.current.selected, i);
            });
            this.rings.push(this.add.graphics());
            const image = this.add.image(x, 205, i ? 'car-blue' : 'car-white').setDisplaySize(310, 166).setInteractive({ useHandCursor: true });
            this.input.setDraggable(image);
            image.on('pointerdown', () => { if (!latest.current.paused) latest.current.select(`car-${i}`); });
            this.images.push(image);
          }
          this.input.on('drag', (_pointer: unknown, image: PhaserType.GameObjects.Image, x: number, y: number) => {
            const index = this.images.indexOf(image);
            if (!latest.current.paused && !latest.current.state.slots.includes(`car-${index}`)) image.setPosition(x, y);
          });
          this.input.on('dragend', (_pointer: unknown, image: PhaserType.GameObjects.Image) => {
            if (latest.current.paused) return;
            const index = this.images.indexOf(image);
            for (let slot = 0; slot < 2; slot++) {
              if (Math.abs(image.x - (270 + slot * 420)) < 175 && Math.abs(image.y - 420) < 110) {
                latest.current.place(`car-${index}`, slot); break;
              }
            }
            this.renderState();
          });
          bridge.current = { render: () => this.renderState(), game };
          this.renderState();
          clearTimeout(watchdog); setReady(true);
        }
        renderState() {
          const { state, selected } = latest.current;
          this.images.forEach((image, i) => {
            const id = `car-${i}`;
            const slot = state.slots.indexOf(id);
            const x = 270 + (slot >= 0 ? slot : i) * 420;
            const y = slot >= 0 ? 424 : 205;
            image.setPosition(x, y);
            const ring = this.rings[i]; ring.clear();
            if (selected === id && slot < 0) {
              ring.lineStyle(4, 0x587a45); ring.strokeRoundedRect(x - 175, y - 92, 350, 184, 22);
            }
            image.setAlpha(slot >= 0 ? 0.92 : 1);
            if (image.input) image.input.enabled = slot < 0;
          });
        }
      }
      try {
        game = new Phaser.Game({ type: Phaser.WEBGL, parent: host.current,
          width: 960, height: 600, backgroundColor: '#f3f4ee',
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
          audio: { noAudio: true }, scene: ParkingScene,
          render: { antialias: true }, banner: false,
        });
        game.canvas.addEventListener('webglcontextlost', onContextLost);
        watchdog = setTimeout(() => { if (!disposed && !bridge.current) latest.current.fallback(); }, 12000);
      } catch { latest.current.fallback(); }
    }).catch(() => { if (!disposed) latest.current.fallback(); });
    return () => {
      disposed = true; clearTimeout(watchdog); bridge.current = null;
      if (game) { game.canvas?.removeEventListener('webglcontextlost', onContextLost); game.destroy(true); }
    };
  }, []);
  useEffect(() => {
    const current = bridge.current;
    if (!current) return;
    if (props.paused) current.game.loop.sleep(); else { current.game.loop.wake(); current.render(); }
  }, [props.state, props.selected, props.paused, ready]);
  return <div className="canvas-parking" ref={host} role="img" aria-label="停车场：可以拖动车辆，或点车再点空车位。键盘操作可切换点选模式。">
    {!ready && <span className="image-loading">停车场正在准备…</span>}
  </div>;
}
