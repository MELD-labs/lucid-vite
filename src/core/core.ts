import * as DCSParkTypes from "../types/cardano_multiplatform_lib.generated.ts";
import * as EmurgoTypes from "../types/cardano_message_signing.generated.ts";

declare global {
  interface Window {
    DCSpark: typeof DCSParkTypes;
    Emurgo: typeof EmurgoTypes;
  }
}

const C = window.DCSpark as typeof DCSParkTypes;
const M = window.Emurgo as typeof EmurgoTypes;

export { C, M, DCSParkTypes };
