import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "./listen";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Editor, { keepNow, rescue } from "./Editor";
import Gallery from "./Gallery";
import { Dialog } from "./Dialog";
import { logError } from "./crashlog";
import { failure } from "./notice";

// ?gallery, ?smiles=… or ?labels opens a renderer test page instead of the editor.
const params = new URLSearchParams(location.search);

// An error while the editor draws shows a message, not a blank window (REL-23). The drawing as last drawn is kept
// (Editor's rescue): Save As writes it to a new file, and Cancel opens the editor again with it. The error goes to
// the crash log on this computer.
class Guard extends Component<{ children: ReactNode }, { failed: boolean; key: number; note?: string }> {
  state: { failed: boolean; key: number; note?: string } = { failed: false, key: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(`The editor stopped: ${error.stack ?? error}\n${info.componentStack ?? ""}`, true);
    keepNow();
  }
  // Quit while this shows (Octet > Quit, or the Dock's Quit with unsaved changes) closes Octet. The copy kept for
  // recovery stays, so Home offers the drawing at the next start.
  off?: Promise<() => void>;
  componentDidMount() {
    if ("__TAURI_INTERNALS__" in window) this.off = listen<string>("menu", (e) => { if (this.state.failed && e.payload === "quit") void getCurrentWindow().destroy(); });
  }
  componentWillUnmount() {
    void this.off?.then((f) => f());
  }
  reopen = () => this.setState((s) => ({ failed: false, key: s.key + 1, note: undefined }));
  saveAs = async () => {
    const r = rescue.current;
    if (!r) return this.reopen();
    try {
      const path = await invoke<string | null>("save_drawing", { path: null, name: r.name, contents: r.contents() });
      if (!path) return;
      rescue.current = { ...r, file: { path, saved: r.h.stack[r.h.at] } };
      this.reopen();
    } catch (e) {
      this.setState({ note: failure("Octet cannot save this drawing.", e) });
    }
  };
  render() {
    if (this.state.failed) return (
      <Dialog title="Octet cannot show this drawing" action="Save As…" onAction={() => void this.saveAs()} onClose={this.reopen}>
        <p className="dialog-note">An error stopped the editor. Octet kept your drawing. Save it as a new file before you continue.</p>
        {this.state.note && <p className="dialog-note">{this.state.note}</p>}
      </Dialog>
    );
    return <Fragment key={this.state.key}>{this.props.children}</Fragment>;
  }
}

export default function App() {
  if (params.has("gallery") || params.has("smiles") || params.has("labels"))
    return <Gallery smiles={params.get("smiles") ?? undefined} labels={params.has("labels")} />;
  return <Guard><Editor /></Guard>;
}
