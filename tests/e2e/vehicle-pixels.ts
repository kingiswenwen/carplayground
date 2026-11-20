import type {Locator} from '@playwright/test';

export function vehiclePixels(canvas:Locator){
  // Compare the model's rendered pixels without counting the showroom art.
  return canvas.screenshot({style:`
    .vehicle-views, .vehicle-webgl { background: #000 !important; }
    .vehicle-scenery, .vehicle-views::before,
    .car-roundabout :is(.car-voice, .car-heart, .viewer-mode, .model-paints, .orbit-invitation) {
      visibility: hidden !important;
    }
  `});
}
