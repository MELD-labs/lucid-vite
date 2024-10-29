import DCSParkTypes from "../types/cardano_multiplatform_lib.generated";
import EmurgoTypes from "../types/cardano_message_signing.generated";

declare global {
  interface Window {
    DCSpark: typeof DCSParkTypes;
    Emurgo: typeof EmurgoTypes;
  }
}

const C = window.DCSpark;
const M = window.Emurgo;

export { C, M };
