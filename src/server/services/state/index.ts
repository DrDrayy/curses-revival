import { IServiceInterface } from "@/types";
import { BaseDirectory, copyFile, createDir, exists, readBinaryFile, renameFile, writeBinaryFile } from "@tauri-apps/api/fs";
import debounce from "lodash/debounce";
import { toast } from "react-toastify";
import { proxy, subscribe } from "valtio";
import { BackendState, BackendSchema } from "../../schema";

// a virus scanner or sync tool can hold the file for a moment
const READ_RETRIES = 3;
const READ_RETRY_WAIT = 300;

class Service_State implements IServiceInterface {
  state!: BackendState;

  // set when an unreadable settings file could not be backed up: never overwrite it
  #saveDisabled = false;

  async init() {
    let data = await this.#load_state();
    const hasData = !!data;
    // create new state
    if (!hasData) {
      data = {};
    }
    
    this.state = proxy(BackendSchema.parse(data));
    !hasData && this.#save_state();
    subscribe(this.state, () => this.#save_state());
  }

  private tryParseState(str: string | null) {
    if (str) try {
      const parse = JSON.parse(str);
      if (typeof parse !== "object") return;
      return parse;
    } catch (error) {
      console.error("invalid state data");
    }
  }

  // only the read is tried again, bad content would not get better
  async #read_file(): Promise<Uint8Array> {
    for (let retry = 0; ; retry++) {
      try {
        return await readBinaryFile("user/settings", {dir: BaseDirectory.AppData});
      } catch (error) {
        if (retry >= READ_RETRIES)
          throw error;
        await new Promise(resolve => setTimeout(resolve, READ_RETRY_WAIT));
      }
    }
  }

  async #load_state(): Promise<Record<string, any> | undefined> {
    const decoder = new TextDecoder();
    const fileExists = await exists("user/settings", {dir: BaseDirectory.AppData});
    if (!fileExists)
      return;
    try {
      const data = await this.#read_file();
      const parsed = this.tryParseState(decoder.decode(data));
      if (!parsed)
        throw new Error("invalid state data");
      return parsed;
    } catch (error) {
      // file is there but unreadable: keep a copy before defaults get saved over it
      const backupName = `user/settings.${Date.now()}.bak`;
      try {
        await copyFile("user/settings", backupName, {dir: BaseDirectory.AppData});
      } catch (backupError) {
        console.error("could not back up unreadable settings", backupError);
        this.#saveDisabled = true;
        toast("Settings could not be loaded or backed up, changes will not be saved", { type: "error", autoClose: false });
        return;
      }
      // the lock may be gone by now: if the copy is readable, those are the real settings
      try {
        const parsed = this.tryParseState(decoder.decode(await readBinaryFile(backupName, {dir: BaseDirectory.AppData})));
        if (parsed)
          return parsed;
      } catch (copyReadError) {}
      toast(`Settings could not be read, defaults were loaded. The old file was kept as ${backupName}`, { type: "error", autoClose: false });
      return;
    }
  }

  async #write_state() {
    if (this.#saveDisabled)
      return;
    const encoder = new TextEncoder();
    const bExists = await exists("user", { dir: BaseDirectory.AppData });
    if (!bExists)
      await createDir("user", { dir: BaseDirectory.AppData, recursive: true });
    const value = JSON.stringify(this.state);
    // write to a temp file first, so a failed write can't leave a half-written settings file
    await writeBinaryFile("user/settings.tmp", encoder.encode(value), {append: false, dir: BaseDirectory.AppData});
    await renameFile("user/settings.tmp", "user/settings", {dir: BaseDirectory.AppData});
  }

  // one write at a time
  #writing: Promise<void> = Promise.resolve();
  #save_state = debounce(() => {
    this.#writing = this.#writing
      .then(() => this.#write_state())
      .catch(error => console.error("could not save settings", error));
  }, 1000);
}
export default Service_State;
