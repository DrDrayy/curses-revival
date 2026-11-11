import { listen, UnlistenFn }                             from "@tauri-apps/api/event";
import { invoke }                                          from "@tauri-apps/api/tauri";
import debounce                                            from "lodash/debounce";
import { toast }                                           from "react-toastify";
import { proxy }                                           from "valtio";
import { subscribeKey }                                    from "valtio/utils";
import { IServiceInterface, TextEventType }                from "@/types";
import { serviceSubscibeToInput, serviceSubscibeToSource } from "../../../utils";
import { VRC_Backends }                                    from "./schema";
import VRC_KillFrenzyTarget                                from "./targets/killfrenzy";
import VRC_TextboxTarget                                   from "./targets/textbox";
import { IVRCTarget }                                      from "./types";

async function sleep(time: number) {
  return new Promise((res) => setTimeout(res, time));
}

// what the osc plugin's listener reports (src-tauri/src/services/osc.rs)
type VRC_OscEvent = { kind: "afk", value: boolean } | { kind: "seen" };

class Service_VRC implements IServiceInterface {
  get #state() {
    return window.ApiServer.state.services.vrc.data;
  }

  // AFK pause: what VRChat sends back over OSC
  status = proxy({
    listening: false,
    afk: false,
    lastSeen: 0, // Date.now() of the last OSC data
    error: "",
  });

  targets: Record<VRC_Backends, IVRCTarget | undefined> = {
    [VRC_Backends.textbox]: undefined,
    [VRC_Backends.killfrenzy]: undefined
  }

  get #activeTarget() {
    return this.targets[this.#state.target];
  }

  // AFK in VRChat: nobody reads the chatbox, so the text is dropped
  get #afkPaused() {
    return this.#state.afkPause && this.status.afk;
  }

  #cancelAll() {
    Object.values(this.targets).forEach(target => target?.cancel());
  }

  async init() {
    this.targets.textbox = new VRC_TextboxTarget();
    this.targets.killfrenzy = new VRC_KillFrenzyTarget();
    // switched off or to the other target: messages still waiting must not keep going out
    subscribeKey(this.#state, "enable", enabled => !enabled && this.#cancelAll());
    subscribeKey(this.#state, "target", () => this.#cancelAll());
    serviceSubscibeToSource(this.#state, "source", (data) => {
      if (!this.#state.enable || this.#afkPaused || !data) return;
      if (data.type === TextEventType.final) {
        this.#activeTarget?.pushFinal(data.value);
      } else {
        this.#activeTarget?.pushInterim(data.value);
      }
    });
    serviceSubscibeToInput(this.#state, "inputField", (data) => {
      if (!this.#state.enable || this.#afkPaused || !data) return;
      if (data.type === TextEventType.final) {
        this.#activeTarget?.pushFinal(data.value);
      } else {
        this.#activeTarget?.pushInterim(data.value);
      }
    });

    subscribeKey(this.#state, "afkPause", () => this.#updateListener());
    // the port is typed one digit at a time: wait until it is complete
    subscribeKey(this.#state, "oscListenPort", () => this.#updateListenerDebounced());
    this.#updateListener();
  }

  #unlistenOsc?: UnlistenFn;
  // port the OSC listener runs on, 0 = stopped
  #listenPort = 0;
  // listener changes run one at a time and in order: a late "listen" must not undo a "stop"
  #listenerQueue: Promise<void> = Promise.resolve();
  #updateListenerDebounced = debounce(() => this.#updateListener(), 1000);

  #updateListener() {
    this.#listenerQueue = this.#listenerQueue.then(() => this.#applyListener());
  }

  // start, restart or stop the OSC listener to match the settings
  async #applyListener() {
    const enabled = this.#state.afkPause;
    const port = Number(this.#state.oscListenPort);
    if (enabled && this.#listenPort && this.#listenPort === port)
      return;

    if (this.#listenPort) {
      this.#listenPort = 0;
      this.status.listening = false;
      await invoke("plugin:osc|stop_listen").catch(() => {});
    }
    // turned off, or nothing known yet from the new port
    this.status.afk = false;
    this.status.lastSeen = 0;
    this.status.error = "";

    if (!enabled) {
      this.#unlistenOsc?.();
      this.#unlistenOsc = undefined;
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      this.status.error = `Port ${this.#state.oscListenPort} is not valid`;
      return;
    }
    try {
      this.#unlistenOsc ??= await listen<VRC_OscEvent>("vrc_osc", e => this.#onOscEvent(e.payload));
      await invoke("plugin:osc|listen", { port });
      this.#listenPort = port;
      this.status.listening = true;
    } catch (e) {
      this.status.error = String(e);
      toast(`[VRChat] ${this.status.error}`, { type: "error", autoClose: 5000 });
    }
  }

  #onOscEvent(event: VRC_OscEvent) {
    // a last event from a listener that was just stopped
    if (!this.#state.afkPause) return;
    this.status.lastSeen = Date.now();
    if (event.kind !== "afk" || event.value === this.status.afk) return;
    this.status.afk = event.value;
    // gone AFK: chunks still waiting and the typing bubble go too
    if (event.value)
      this.#cancelAll();
  }

  sendTest(value: string): void {
    this.targets.textbox?.pushFinal(value);
  }

  sendOsc(path: string, args: any[]) {
    invoke("plugin:osc|send", {
      rpc: {
        path,
        args,
      },
    });
  }
}

export default Service_VRC;
