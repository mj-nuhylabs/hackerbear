// Home's calls to the app: the recent drawings (src-tauri/src/recent.rs), drawings a crash took (recovery.rs), and the
// projects and thumbnails (home.rs). In the UI-only preview (npm run dev with no app), ?demo answers them from
// src/homedemo.ts with made-up drawings, so Home can be seen and tried with no files. The demo is never in a build.
import { invoke } from "@tauri-apps/api/core";

const TAURI = "__TAURI_INTERNALS__" in window;
const DEMO = !TAURI && new URLSearchParams(location.search).has("demo");
// Home can reach the app (or the demo).
export const HOME_API = TAURI || (import.meta.env.DEV && DEMO);

let demo: Promise<(cmd: string, args?: Record<string, unknown>) => unknown> | undefined;
export function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (TAURI) return invoke<T>(cmd, args);
  if (import.meta.env.DEV && DEMO) {
    demo ??= import("./homedemo").then((m) => m.answer);
    return demo.then(async (answer) => (await answer(cmd, args)) as T);
  }
  return Promise.reject(new Error("Octet cannot do this here."));
}
