// src/main/state.js
let cutsceneActive = false;
let uiModalActive = false;

let divineLiftActive = false;
let divineLiftY = 0;

export function getCutsceneActive() { return cutsceneActive; }
export function setCutsceneActive(v) { cutsceneActive = !!v; }

export function getUiModalActive() { return uiModalActive; }
export function setUiModalActive(v) { uiModalActive = !!v; }

export function getDivineLiftActive() { return divineLiftActive; }
export function setDivineLiftActive(v) { divineLiftActive = !!v; }

export function getDivineLiftY() { return divineLiftY; }
export function setDivineLiftY(v) { divineLiftY = +v || 0; }