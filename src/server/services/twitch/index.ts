import { IServiceInterface, ServiceNetworkState, TextEventType } from "@/types";
import { ApiClient, HelixUser } from "@twurple/api";
import { InvalidTokenError, InvalidTokenTypeError, StaticAuthProvider } from "@twurple/auth";
import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import {
  serviceSubscibeToInput,
  serviceSubscibeToSource,
} from "../../../utils";
import TwitchChatApi from "./chat";
import TwitchEmotesApi from "./emotes";
const scope = ["chat:read", "chat:edit", "channel:read:subscriptions"];
// wait before connect() is tried again after a network or service error, doubles up to the maximum
const RETRY_MIN = 15000;
const RETRY_MAX = 5 * 60000;

// token is rejected by twitch (invalid, expired, revoked)
function isAuthError(error: any): boolean {
  if (error instanceof InvalidTokenError || error instanceof InvalidTokenTypeError)
    return true;
  return error?.statusCode === 401 || error?.cause?.statusCode === 401;
}

function originOf(url: string | undefined): string | undefined {
  try {
    const origin = new URL(url ?? "").origin;
    return origin === "null" ? undefined : origin;
  } catch (error) {
    return undefined;
  }
}

class Service_Twitch implements IServiceInterface {
  authProvider?: StaticAuthProvider;
  constructor() {}

  emotes!: TwitchEmotesApi;
  chat!: TwitchChatApi;

  liveCheckInterval?: any = null;

  apiClient?: ApiClient;

  // removes the message listener of the login popup that is currently open
  #loginCleanup?: () => void;

  // pending retry of connect() and the wait before the next one
  #retryTimer?: ReturnType<typeof setTimeout>;
  #retryDelay = RETRY_MIN;

  state = proxy<{
    user: HelixUser | null;
    liveStatus: ServiceNetworkState;
  }>({
    liveStatus: ServiceNetworkState.disconnected,
    user: null,
  });

  get #state() {
    return window.ApiServer.state.services.twitch;
  }

  async init() {
    this.emotes = new TwitchEmotesApi();
    this.chat = new TwitchChatApi();
    // check live status
    setInterval(() => this.#checkLive(), 4000);

    // login with token
    this.connect();

    subscribeKey(this.#state.data, "chatEnable", (value) => {
      if (value) {
        if (this.state.user && this.authProvider)
          this.chat.connect(this.state.user.name, this.authProvider);
      } else this.chat.disconnect();
    });

    serviceSubscibeToSource(this.#state.data, "chatPostSource", (data) => {
      if (
        this.#state.data.chatPostLive &&
        this.state.liveStatus !== ServiceNetworkState.connected
      )
        return;
      this.#state.data.chatPostEnable &&
        data?.value &&
        data?.type === TextEventType.final &&
        this.chat.post(data.value);
    });

    serviceSubscibeToInput(this.#state.data, "chatPostInput", (data) => {
      if (
        this.#state.data.chatPostLive &&
        this.state.liveStatus !== ServiceNetworkState.connected
      )
        return;
      this.#state.data.chatPostEnable &&
        data?.textFieldType !== "twitchChat" &&
        data?.value &&
        data?.type === TextEventType.final &&
        this.chat.post(data.value);
    });
  }

  #clearRetry() {
    clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
  }

  // try connect() again later while a token is set, never more than one timer
  #scheduleRetry() {
    this.#clearRetry();
    if (!this.#state.data.token)
      return;
    const delay = this.#retryDelay;
    this.#retryDelay = Math.min(delay * 2, RETRY_MAX);
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined;
      this.connect();
    }, delay);
  }

  login() {
    try {
      this.#clearRetry();
      // only one login popup listener at a time
      this.#loginCleanup?.();

      const redirect =
        import.meta.env.MODE === "development"
          ? "http://localhost:1420/oauth_twitch.html"
          : import.meta.env.CURSES_TWITCH_CLIENT_REDIRECT_LOCAL;

      const link = new URL("https://id.twitch.tv/oauth2/authorize");
      link.searchParams.set(
        "client_id",
        import.meta.env.CURSES_TWITCH_CLIENT_ID
      );
      link.searchParams.set("redirect_uri", redirect);
      link.searchParams.set("response_type", "token");
      link.searchParams.set("scope", scope.join("+"));
      link.search = decodeURIComponent(link.search);
      const ownOrigin = window.location.origin;

      // messages are accepted only from this app or from the redirect page served by it
      const allowedOrigins = [ownOrigin, originOf(redirect)].filter(o => o && o !== "null");

      const auth_window = window.open(link, "", "width=600,height=600");
      const thisRef = this;

      let closedPoll: ReturnType<typeof setInterval> | undefined;
      const cleanup = () => {
        window.removeEventListener("message", handleMessage, true);
        clearInterval(closedPoll);
        if (thisRef.#loginCleanup === cleanup)
          thisRef.#loginCleanup = undefined;
      };

      const handleMessage = (msg: MessageEvent<unknown>) => {
        if (!allowedOrigins.includes(msg.origin))
          return;
        if (typeof msg.data !== "string")
          return;
        const match = /^smplstt_tw_auth:([A-Za-z0-9_-]+)$/.exec(msg.data);
        if (!match)
          return;
        thisRef.#state.data.token = match[1];
        thisRef.connect();
        cleanup();
      };
      if (auth_window) {
        window.addEventListener("message", handleMessage, true);
        thisRef.#loginCleanup = cleanup;
        // popup closed without a result: stop listening (a bit later, so a message sent right before closing still arrives)
        closedPoll = setInterval(() => {
          if (auth_window.closed) {
            clearInterval(closedPoll);
            setTimeout(cleanup, 1000);
          }
        }, 1000);
      }
    } catch (error) {}
  }

  logout() {
    // connects still waiting for twitch are now stale
    this.#connectAttempt++;
    this.#clearRetry();
    this.#retryDelay = RETRY_MIN;
    window.ApiServer.state.services.twitch.data.token = "";
    this.chat.dispose();
    delete this.apiClient;
    delete this.authProvider;
    this.emotes.dispose();
    this.state.user = null;
    this.state.liveStatus = ServiceNetworkState.disconnected;
  }

  async #checkLive() {
    if (!this.state.user?.name) {
      this.state.liveStatus = ServiceNetworkState.disconnected;
      return;
    }
    try {
      const resp = await this.apiClient?.streams.getStreamByUserName(
        this.state.user.name
      );
      // window.ApiShared.pubsub.publishLocally({topic: "stream.on_started"});
      const prevStatus = this.state.liveStatus;
      this.state.liveStatus = !!resp
        ? ServiceNetworkState.connected
        : ServiceNetworkState.disconnected;
      // stream ended
      if (prevStatus === ServiceNetworkState.connected && this.state.liveStatus == ServiceNetworkState.disconnected) {
        window.ApiShared.pubsub.publishLocally({topic: "stream.on_ended"});
      }
    } catch (error) {
      this.state.liveStatus = ServiceNetworkState.disconnected;
    }
  }

  // each connect() gets a number: an older attempt that finishes late must not touch the newer one
  #connectAttempt = 0;

  async connect() {
    // this attempt replaces a waiting retry
    this.#clearRetry();
    const attempt = ++this.#connectAttempt;
    const isStale = () => attempt !== this.#connectAttempt;
    try {
      if (!this.#state.data.token) return this.logout();

      const authProvider = new StaticAuthProvider(
        import.meta.env.CURSES_TWITCH_CLIENT_ID,
        this.#state.data.token,
        scope
      );
      const apiClient = new ApiClient({ authProvider });
      this.authProvider = authProvider;
      this.apiClient = apiClient;

      const tokenInfo = await apiClient.getTokenInfo();
      if (isStale()) return;
      if (!tokenInfo.userId) return this.logout();

      const me = await apiClient.users.getUserById({
        id: tokenInfo.userId,
      });
      if (isStale()) return;

      if (!me) return this.logout();

      this.state.user = me;

      // initial live check
      this.#checkLive();

      this.emotes.loadEmotes(me.id, apiClient);
      if (this.#state.data.chatEnable)
        this.chat.connect(me.name, authProvider);
      // connected: the next failure starts with the short wait again
      this.#retryDelay = RETRY_MIN;
    } catch (error) {
      // a newer login or logout took over
      if (isStale())
        return;
      if (isAuthError(error))
        this.logout();
      else {
        // network or service trouble: keep the token, just show as disconnected
        console.error("[Twitch] connect failed", error);
        this.chat.dispose();
        delete this.apiClient;
        delete this.authProvider;
        this.state.user = null;
        this.state.liveStatus = ServiceNetworkState.disconnected;
        this.#scheduleRetry();
      }
    }
  }
}

export default Service_Twitch;
