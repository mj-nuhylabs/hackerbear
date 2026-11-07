// Feedback (Sam, 17 October 2026), for testers: in every build except the public release, which the release workflow
// makes with OCTET_FEEDBACK=0 (vite.config.ts, REL-8). ⌘ held with 1, 2 and 3 pressed together (Ctrl on Windows and
// Linux) takes a picture of the window, then opens this box. Send opens an email to Sam in the mail app with the note
// and the picture attached; the tester sends it from there.
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog } from "./Dialog";

export function Feedback({ picture, onClose, onSent, onError }: { picture?: string; onClose: () => void; onSent: () => void; onError: (message: string) => void }) {
  const [note, setNote] = useState("");
  const send = () => void invoke("send_feedback", { note, picture: picture ?? null }).then(onSent, (e) => onError(String(e)));
  return (
    <Dialog title="Feedback" action="Send" onClose={onClose} onAction={send}>
      <textarea className="feedback-note" value={note} rows={5} maxLength={20000} aria-label="Feedback" placeholder="What happened, and what did you expect?" onChange={(e) => setNote(e.target.value)} />
      {picture && <img className="feedback-picture" src={`data:image/png;base64,${picture}`} alt="The window when you opened Feedback" />}
    </Dialog>
  );
}
