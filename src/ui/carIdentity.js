/** Shared identity variables for the Hub and future Showcase consumers. */
export function applyCarColor(element, car) {
  element.classList.add('car-identity');
  element.style.setProperty('--car-color', car.identityColor);
  element.style.setProperty('--car-color-night', car.identityColorNight ?? car.identityColor);
}
