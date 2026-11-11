import { ServiceNetworkState, TextEventSource, TextEventType } from "@/types";
import { AuthProvider } from "@twurple/auth";
import { ChatClient } from "@twurple/chat";
import { proxy } from "valtio";
import { splitText } from "../vrc/targets/utils";

// twitch rejects chat messages longer than this
const MAX_CHAT_LENGTH = 500;

class TwitchChatApi {
  chatClient?: ChatClient;

  get #state() {
    return window.ApiServer.state.services.twitch;
  }

  state = proxy({
    username: "",
    connection: ServiceNetworkState.disconnected,
  });

  async connect(username: string, authProvider: AuthProvider) {
    // one client at a time, also while the first one is still connecting
    if (this.chatClient || this.state.connection !== ServiceNetworkState.disconnected)
      return;
    const client = new ChatClient({ authProvider, channels: [username] });
    this.chatClient = client;
    client.irc.onConnect(() => {
      if (this.chatClient !== client) return;
      this.state.username = username;
      this.state.connection = ServiceNetworkState.connected;
    });

    client.irc.onDisconnect(() => {
      if (this.chatClient !== client) return;
      this.state.username = "";
      this.state.connection = ServiceNetworkState.disconnected;
    });

    client.onMessage((channel, user, message, msg) => {
      if (msg.userInfo.userName !== this.state.username) return;

      if (this.#state.data.chatReceiveEnable) {
        window.ApiShared.pubsub.publishText(TextEventSource.textfield, {
          type: TextEventType.final,
          value: msg.text,
          textFieldType: "twitchChat",
        });
      }
    });

    try {
      await client.connect();
    } catch (error) {
      // let the next connect() start over
      if (this.chatClient === client) {
        this.chatClient = undefined;
        this.state.username = "";
        this.state.connection = ServiceNetworkState.disconnected;
      }
    }
  }

  disconnect() {
    const client = this.chatClient;
    this.chatClient = undefined;
    client?.quit();
    this.state.username = "";
    this.state.connection = ServiceNetworkState.disconnected;
  }

  dispose() {
    this.disconnect(); 
  }

  post(message: string) {
    this.state.username &&
    this.state.connection === ServiceNetworkState.connected &&
    setTimeout(async () => {
      // longer messages are split at spaces and sent in order
      for (const part of splitText(message, MAX_CHAT_LENGTH)) {
        try {
          await this.chatClient?.say(this.state.username, part);
        } catch (error) {
          console.error("[Twitch] unable to post in chat", error);
          return;
        }
      }
    }, parseFloat(this.#state.data.chatSendDelay) || 0);
  }
}

export default TwitchChatApi;
