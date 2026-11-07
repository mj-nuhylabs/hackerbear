// Errors for the crash log on this computer (src-tauri/src/crashlog.rs, REL-23). Octet sends the log nowhere.
// crash: the editor stopped, so the next start offers the log. 20 entries at most for each run, so an error that
// repeats does not fill the log.
import { invoke } from "@tauri-apps/api/core";

let count = 0;
export function logError(text: string, crash = false) {
  if (!("__TAURI_INTERNALS__" in window) || count++ >= 20) return;
  invoke("log_error", { text: text.slice(0, 8000), crash }).catch(() => {});
}

// Errors that nothing else caught.
export function watchErrors() {
  addEventListener("error", (e) => logError(`${e.error instanceof Error && e.error.stack ? e.error.stack : e.message} (${e.filename}:${e.lineno}:${e.colno})`));
  addEventListener("unhandledrejection", (e) => logError(`Unhandled rejection: ${e.reason instanceof Error ? e.reason.stack ?? e.reason.message : String(e.reason)}`));
}
