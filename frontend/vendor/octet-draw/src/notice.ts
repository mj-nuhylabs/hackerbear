// Notices: the short message at the bottom of the window. Its kind sets its icon, how long it stays, and what it
// says when something fails.

// error: something did not happen (Warning icon, read out at once). info: a hint or a wait (Info icon). done: a
// thing finished, such as an export (Check icon).
export type NoticeKind = "error" | "info" | "done";

// A notice stays 4 s and 50 ms more for each character, so a long one stays long enough to read.
export const noticeTime = (text: string) => 4000 + 50 * text.length;

// Why something failed, as a plain sentence, or "" when there is nothing useful to say. Octet's own messages (from
// the file readers and the app's Rust side) are sentences already, so they go as they are. Common system errors are
// put in words. A raw exception is never shown.
export function reason(e: unknown): string {
  const s = (e instanceof Error ? e.message : String(e ?? "")).trim();
  if (/permission denied|access is denied|operation not permitted/i.test(s)) return "Octet does not have permission to use this file or folder.";
  if (/no space left|disk is full|not enough space/i.test(s)) return "The disk is full.";
  if (/read-only file system/i.test(s)) return "The disk is read-only.";
  if (/no such file|cannot find the (file|path)/i.test(s)) return "The file or folder is not there.";
  if (/used by another process|sharing violation/i.test(s)) return "Another app is using the file.";
  return /^[A-Z][^\n]{0,200}\.$/.test(s) && !/error|exception|undefined|null|panick/i.test(s) ? s : "";
}

// A failure's notice: what Octet could not do, then why. A reason that says what Octet cannot do goes alone. The raw
// error goes to the console.
export function failure(what: string, e: unknown): string {
  console.error(e);
  const why = reason(e);
  return !why ? what : why.startsWith("Octet cannot") ? why : `${what} ${why}`;
}

// A saved file's name, from its path on any system.
export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
