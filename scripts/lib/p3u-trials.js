// Browser-side candidate imports go through Vite's import analysis (never raw
// node_modules URLs, whose bare `three` imports the browser cannot resolve).
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
