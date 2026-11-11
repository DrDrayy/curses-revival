import { invoke } from "@tauri-apps/api/tauri";
import { proxy }             from "valtio";
import { IServiceInterface } from "@/types";

type SoundEffects = {
  volume?: number;
  playbackMin?: number;
  playbackMax?: number;
  detuneMin?: number;
  detuneMax?: number;
};

class Service_Sound implements IServiceInterface {
  constructor() {}
  private audioContext!: AudioContext;

  async init() {
    this.audioContext = new AudioContext();
  }

  #audioFiles: { [fileId: string]: AudioBuffer } = {};

  private random = (min: number, max: number) =>
    Math.random() * (max - min) + min;
  async playFile(fileId: string, effects?: SoundEffects) {
    if (window.Config.isServer() && window.ApiServer.state.muteSoundEffects) {
      return;
    }

    if (!this.#audioFiles[fileId])
      try {
        const buffer = window.ApiClient.files.getFileBuffer(fileId);
        if (!buffer) return;
        // copy only this file's bytes: the Uint8Array can be a view into a bigger buffer
        this.#audioFiles[fileId] = await this.audioContext.decodeAudioData(
          buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        );
      } catch (error) {
        return;
      }

    const gainNode = this.audioContext.createGain();
    // volume 0 is a valid volume (mute): use 1 only if it is not a number
    const volume = effects?.volume;
    gainNode.gain.value = typeof volume === "number" && Number.isFinite(volume) ? volume : 1;
    gainNode.connect(this.audioContext.destination);

    const source = this.audioContext.createBufferSource();
    source.buffer = this.#audioFiles[fileId];
    source.connect(gainNode);

    // region effects
    // -1200 1200
    if (effects?.detuneMin || effects?.detuneMax) {
      source.detune.value = this.random(
        Math.max(-1200, effects.detuneMin ?? 0),
        Math.min(1200, effects.detuneMax ?? 0)
      );
    }
    if (effects?.playbackMin || effects?.playbackMax) {
      source.playbackRate.value = this.random(
        Math.max(0.1, effects.playbackMin ?? 1),
        Math.min(3, effects.playbackMax ?? 1)
      );
    }
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };
    // endregion

    source.start();
  }
}

export default Service_Sound;
