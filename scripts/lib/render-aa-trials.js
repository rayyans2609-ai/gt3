// Browser-side Vite imports for the bounded render comparison, never used by the app.
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
export function trialPass(mode, width, height) {
  if (mode === 'smaa') return new SMAAPass();
  const pass = new ShaderPass(FXAAShader);
  pass.uniforms.resolution.value.set(1 / width, 1 / height);
  return pass;
}
