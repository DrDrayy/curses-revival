import {
  IServiceInterface,
  ServiceNetworkState,
  TextEvent,
  TextEventType,
} from "@/types";
import OBSWebSocket, { EventSubscription, OBSWebSocketError } from "obs-websocket-js";
import { toast } from "react-toastify";
import { proxy } from "valtio";
import {
  serviceSubscibeToInput,
  serviceSubscibeToSource,
} from "../../../utils";

// reconnect delay: 2s, doubling up to 30s
const WS_RETRY_MIN = 2000;
const WS_RETRY_MAX = 30000;

class Service_OBS implements IServiceInterface {
  private wsInstance!: OBSWebSocket;
  private wsRequestCancelToken = false;
  private wsConnectInFlight = false;
  private wsRetryTimer?: ReturnType<typeof setTimeout>;
  private wsRetryDelay = WS_RETRY_MIN;

  wsState = proxy({
    status: ServiceNetworkState.disconnected,
  });

  get #state() {
    return window.ApiServer.state.services.obs.data;
  }

  async init() {
    this.wsInstance = new OBSWebSocket();
    this.wsInstance.on("Identified", () => this.wshandleConnected());
    this.wsInstance.on("CurrentProgramSceneChanged", e => this.trySwitchScene(e.sceneName));

    serviceSubscibeToSource(this.#state, "source", e => this.processTextEvent(e));
    serviceSubscibeToInput(this.#state, "inputField", e => this.processTextEvent(e));

    if (this.#state.wsAutoStart)
      this.wsConnect();

  }

  private trySwitchScene(obsSceneName?: string) {
    if (!this.#state.scenesEnable)
      return;
    function trySwitchScene(sceneName: string) {
      const scene = Object.values(window.ApiClient.scenes.scenes).find(f => f.name === sceneName);
      scene && window.ApiShared.pubsub.publish("scenes:change", scene.id);
    }
    
    if (obsSceneName && obsSceneName in this.#state.scenesMap) {
      trySwitchScene(this.#state.scenesMap[obsSceneName])
    }
    else if (this.#state.scenesFallback)
      trySwitchScene(this.#state.scenesFallback);
  }

  private async wshandleConnected() {
    if (this.#state.scenesEnable) try {
      const currentScene = await this.wsInstance.call("GetCurrentProgramScene");
      this.trySwitchScene(currentScene.currentProgramSceneName);
    } catch (error) {
      console.error(error);
    }
  }

  private processTextEvent(data?: TextEvent) {
    if (
      this.#state.captionsEnable &&
      this.wsState.status === ServiceNetworkState.connected &&
      data?.value
      && (
        data?.type === TextEventType.final ||
        (data?.type === TextEventType.interim && this.#state.interim)
      )
    ) {
      this.wsInstance.call("SendStreamCaption", { captionText: data.value }).catch((e: OBSWebSocketError) => {        
        if (e.code !== 501)
          this.toastError(e);
      });
    }
  }

  private toastError(e: OBSWebSocketError) {
    const err = e.message ? "[OBS] " + e.message : "[OBS] Connection error";
    toast(err, { type: "error", autoClose: 2000 });
  }

  private wsHandleDisconnect(e: OBSWebSocketError) {
    if (e.code === 1006 || e.code === 1001) {
      if (this.wsRequestCancelToken) {
        this.wsRequestCancelToken = false;
        this.wsState.status = ServiceNetworkState.disconnected;
      }
      else {
        if (this.#state.wsAutoStart)
          this.wsScheduleReconnect();
        else {
          this.wsState.status = ServiceNetworkState.disconnected;
          this.toastError(e);
        }
      } 
    }
    else {
      this.wsState.status = ServiceNetworkState.disconnected;
      if(e.code !== 1000) { // 1000 - graceful stop
        this.toastError(e);
      }
    }
  }

  // host from settings, local OBS by default
  private get wsHost() {
    return (this.#state.wsHost ?? "").trim() || "127.0.0.1";
  }

  private wsClearRetry() {
    if (this.wsRetryTimer !== undefined) {
      clearTimeout(this.wsRetryTimer);
      this.wsRetryTimer = undefined;
    }
  }

  // try again later, with growing delay
  private wsScheduleReconnect() {
    this.wsClearRetry();
    const delay = this.wsRetryDelay;
    this.wsRetryDelay = Math.min(delay * 2, WS_RETRY_MAX);
    // still "connecting" while waiting, so the user can cancel
    this.wsState.status = ServiceNetworkState.connecting;
    this.wsRetryTimer = setTimeout(() => {
      this.wsRetryTimer = undefined;
      this.wsConnect().catch(() => {});
    }, delay);
  }

  async wsConnect() {
    this.wsClearRetry();
    if (this.#state.wsPort === "") {
      this.wsState.status = ServiceNetworkState.disconnected;
      toast("[OBS] Invalid connection port", { type: "error", autoClose: false });
      return;
    }
    this.wsState.status = ServiceNetworkState.connecting;
    this.wsRequestCancelToken = false;

    try {
      this.wsConnectInFlight = true;
      this.wsInstance.disconnect();
      this.wsInstance.removeAllListeners("ConnectionClosed");
      await this.wsInstance.connect(`ws://${this.wsHost}:${this.#state.wsPort}`,this.#state.wsPassword, {
        eventSubscriptions: EventSubscription.All | EventSubscription.Scenes
      });
      this.wsRetryDelay = WS_RETRY_MIN;
      this.wsState.status = ServiceNetworkState.connected;
      this.wsInstance.addListener("ConnectionClosed", e => this.wsHandleDisconnect(e));
    } catch (e: any) {
      if (e instanceof OBSWebSocketError)
        this.wsHandleDisconnect(e);
      else
        this.wsState.status = ServiceNetworkState.disconnected;
    } finally {
      this.wsConnectInFlight = false;
    }
  }

  wsDisconnect() {
    // user stopped it, no more retries
    this.wsClearRetry();
    this.wsRetryDelay = WS_RETRY_MIN;
    this.wsInstance.disconnect();
    this.wsState.status = ServiceNetworkState.disconnected;
  }

  wsCancel() {
    this.wsClearRetry();
    this.wsRetryDelay = WS_RETRY_MIN;
    if (this.wsState.status === ServiceNetworkState.connecting) {
      if (this.wsConnectInFlight) {
        this.wsRequestCancelToken = true;
        this.wsInstance.disconnect();
      }
      else // only waiting for a retry
        this.wsState.status = ServiceNetworkState.disconnected;
    }
  }

  async setupObsScene({
    name,
    port,
    password,
  }: {
    name: string;
    port: string;
    password: string;
  }) {
    const obs = new OBSWebSocket();

    try {
      await obs.connect(`ws://${this.wsHost}:${port}`, password);
      const activeScene = await obs.call("GetCurrentProgramScene");
      const canvas = window.ApiClient.document.fileBinder.get().canvas;
      await obs.call("CreateInput", {
        sceneName: activeScene.currentProgramSceneName,
        inputName: name,
        inputKind: "browser_source",
        inputSettings: {
          url: window.ApiShared.peer.getClientLink(),
          width: canvas.w,
          height: canvas.h,
        },
      });
      return "";
    } catch (error: any) {
      return error.message || "Something went wrong";
    } finally {
      obs.disconnect();
    }
  }
}

export default Service_OBS;
