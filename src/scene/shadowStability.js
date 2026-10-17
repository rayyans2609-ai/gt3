/** Keep a translating directional shadow map on a world-anchored texel grid.
 * Only the projection centre moves (by at most half a texel). The light direction,
 * depth range and full caster coverage remain unchanged, including during theme fades.
 */
export function stabilizeDirectionalShadow(shadow) {
  const updateMatrices = shadow.updateMatrices;
  const camera = shadow.camera;
  const halfWidth = (camera.right - camera.left) / 2;
  const halfHeight = (camera.top - camera.bottom) / 2;
  shadow.updateMatrices = function (light, viewportIndex) {
    updateMatrices.call(this, light, viewportIndex);
    // View-space world origin. Quantize its projected position, rather than world
    // X/Z: the light-space basis differs between Day, Night and their crossfade.
    const e = camera.matrixWorldInverse.elements;
    const texelX = 2 * halfWidth / this.mapSize.x;
    const texelY = 2 * halfHeight / this.mapSize.y;
    const offsetX = e[12] - Math.round(e[12] / texelX) * texelX;
    const offsetY = e[13] - Math.round(e[13] / texelY) * texelY;
    camera.left = -halfWidth + offsetX;
    camera.right = halfWidth + offsetX;
    camera.bottom = -halfHeight + offsetY;
    camera.top = halfHeight + offsetY;
    camera.updateProjectionMatrix();
    // Rebuild both the sampling matrix and culling frustum with that projection.
    updateMatrices.call(this, light, viewportIndex);
  };
}
