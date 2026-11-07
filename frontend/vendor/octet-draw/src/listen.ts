// Events for this window only. The event module's listen hears the events sent to every window, so a menu command
// sent to the window in front ran in all of Octet's windows. Events sent to all windows (Home's list) still come.
import type { EventCallback } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export const listen = <T,>(event: string, handler: EventCallback<T>) => getCurrentWebviewWindow().listen<T>(event, handler);
