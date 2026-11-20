import type {Locator} from '@playwright/test';

export function vehiclePixels(canvas:Locator){
  // Compare the model's rendered pixels without counting the showroom art.
  return canvas.screenshot({style:`
    .vehicle-views { background: #000 !important; }
    .vehicle-scenery, .vehicle-views::before { visibility: hidden !important; }
  `});
}
