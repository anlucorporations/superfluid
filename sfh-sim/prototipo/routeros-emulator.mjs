// Re-export del emulador canónico (spike de la propuesta).
// El servicio real vive en ../src/routeros-emulator.mjs y se arranca con ../server.mjs.
export { createRouterOsEmulator } from '../src/routeros-emulator.mjs';
