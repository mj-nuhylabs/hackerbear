// The UI-only preview's answers to Home's calls (npm run dev, then ?demo): made-up drawings with the starter drawings'
// pictures, seven projects, and photos for thumbnails drawn on the page. Nothing is saved; a reload starts again.
// Never in a build (homeApi.ts loads it only in the dev server).
import structure from "./starters/structure.svg?raw";
import reaction from "./starters/reaction.svg?raw";
import cycle from "./starters/cycle.svg?raw";
import { STARTERS } from "./starters";
import { STORE_VERSION, type HomeStore } from "./projects";

const t = Math.floor(Date.now() / 1000), day = 86400, dir = "/Users/sam/Documents";
// A drawing deep in folders, so its tooltip shows how a long place wraps.
const tamiflu = `${dir}/Group meeting/2026 autumn/Shikimic acid route to oseltamivir, revised after the meeting/tamiflu route.oct`;
type Recent = { path: string; name: string; at: number; thumb?: string; found: boolean };
let recents: Recent[] = [
  { path: `${dir}/Thesis/oseltamivir.oct`, name: "Oseltamivir", at: t - 600, thumb: structure, found: true },
  { path: `${dir}/Thesis/suzuki scheme.cdxml`, name: "Suzuki scheme", at: t - 3 * 3600, thumb: reaction, found: true },
  { path: `${dir}/Thesis/suzuki cycle.oct`, name: "Suzuki cycle", at: t - day, thumb: cycle, found: true },
  { path: tamiflu, name: "Tamiflu route", at: t - 3 * day, thumb: reaction, found: true },
  { path: `${dir}/Teaching/aldol mechanism.cdx`, name: "Aldol mechanism", at: t - 9 * day, thumb: cycle, found: true },
  { path: `${dir}/Desktop/old scheme.cdx`, name: "Old scheme", at: t - 40 * day, found: false },
];
// Experiment pages on the Experiments list: one also on the recent list (with its picture), one moved.
let experiments = [
  { path: `${dir}/Thesis/suzuki scheme.cdxml`, name: "Suzuki scheme", at: t - 3 * 3600, found: true, details: { title: "Suzuki coupling of 4-bromoanisole", date: "3 November 2026", notebook: "SE-012-041", project: "Biaryls", author: "Sam" }, yield: 0.82 },
  { path: `${dir}/Lab/boc glutamic.oct`, name: "boc glutamic", at: t - 2 * day, found: true, details: { title: "Boc protection of D-glutamic acid", date: "1 November 2026", notebook: "SE-012-034", project: "Peptides" }, yield: 0.913 },
  { path: `${dir}/Lab/grignard.oct`, name: "grignard", at: t - 12 * day, found: true, details: { title: "Grignard addition, -78 °C", date: "22 October 2026", notebook: "SE-011-120", project: "Biaryls" } },
  { path: `${dir}/Desktop/old prep.oct`, name: "old prep", at: t - 40 * day, found: false, details: { date: "30 September 2026", notebook: "SE-010-007" } },
];
const thumbs = new Map<string, string>();
let count = 0, store: HomeStore | undefined;
const id = () => (++count).toString(16).padStart(16, "0");

// A photo, drawn: a page of a lab notebook (blue squares, a ring and an arrow in pen), or a TLC plate.
function photo(kind: "notebook" | "plate", type = "image/jpeg"): string {
  const c = document.createElement("canvas"), g = c.getContext("2d")!;
  c.width = 1200; c.height = 900;
  if (kind === "notebook") {
    g.fillStyle = "#f4f2ec"; g.fillRect(0, 0, 1200, 900);
    g.strokeStyle = "rgba(70, 110, 190, 0.35)"; g.lineWidth = 2;
    for (let x = 0; x < 1200; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 900); g.stroke(); }
    for (let y = 0; y < 900; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(1200, y); g.stroke(); }
    g.strokeStyle = "#1d2a5c"; g.lineWidth = 7; g.lineJoin = "round";
    const ring = (cx: number, cy: number, r: number) => { g.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k * Math.PI) / 3; g[k ? "lineTo" : "moveTo"](cx + r * Math.sin(a), cy - r * Math.cos(a)); } g.stroke(); };
    ring(330, 450, 120); ring(870, 450, 120);
    g.beginPath(); g.moveTo(500, 450); g.lineTo(700, 450); g.moveTo(670, 425); g.lineTo(700, 450); g.lineTo(670, 475); g.stroke();
  } else {
    g.fillStyle = "#2a2f45"; g.fillRect(0, 0, 1200, 900);
    g.fillStyle = "#eef0f2"; g.fillRect(420, 80, 360, 740);
    g.strokeStyle = "#7a8090"; g.lineWidth = 3; g.beginPath(); g.moveTo(440, 740); g.lineTo(760, 740); g.stroke();
    for (const [x, y, r] of [[500, 520, 18], [600, 380, 22], [700, 300, 16], [600, 610, 14]]) { g.fillStyle = "rgba(60, 70, 160, 0.75)"; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  }
  return c.toDataURL(type, 0.9);
}

// Seven projects in the document colours, so a drawing's tile shows five dots and More. Group meeting has a photo of
// its own, Outreach is empty, and the recent drawings are in some of them.
function first(): HomeStore {
  const notebook = id(), auto = id(), own = id();
  thumbs.set(notebook, photo("notebook"));
  thumbs.set(auto, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(structure)}`);
  thumbs.set(own, photo("plate"));
  const d = (path: string, name: string) => ({ path, name, added: t - 2 * day });
  return {
    version: STORE_VERSION,
    projects: [
      { id: "thesis", name: "Thesis chapter 2", made: t - 30 * day, used: t - day, drawings: [d(`${dir}/Thesis/oseltamivir.oct`, "Oseltamivir"), d(`${dir}/Thesis/suzuki scheme.cdxml`, "Suzuki scheme"), d(`${dir}/Thesis/suzuki cycle.oct`, "Suzuki cycle"), d(`${dir}/Thesis/route b.oct`, "Route B"), d(`${dir}/Desktop/old scheme.cdx`, "Old scheme")] },
      { id: "group", name: "Group meeting", made: t - 10 * day, used: t - 2 * day, colour: "#22775B", thumb: notebook, drawings: [d(tamiflu, "Tamiflu route"), d(`${dir}/Thesis/suzuki scheme.cdxml`, "Suzuki scheme")] },
      { id: "teaching", name: "Teaching", made: t - 5 * day, colour: "#8B4E18", drawings: [d(`${dir}/Teaching/aldol mechanism.cdx`, "Aldol mechanism")] },
      { id: "suzuki", name: "Suzuki paper", made: t - 20 * day, used: t - 3 * day, colour: "#B42323", drawings: [d(`${dir}/Thesis/suzuki cycle.oct`, "Suzuki cycle"), d(`${dir}/Thesis/suzuki scheme.cdxml`, "Suzuki scheme")] },
      { id: "outreach", name: "Outreach", made: t - 4 * day, colour: "#3F6BFF", drawings: [] },
      { id: "posters", name: "Posters", made: t - 60 * day, colour: "#0F172A", drawings: [d(`${dir}/Thesis/oseltamivir.oct`, "Oseltamivir")] },
      { id: "archive", name: "Archive", made: t - 90 * day, colour: "#000000", drawings: [d(`${dir}/Teaching/aldol mechanism.cdx`, "Aldol mechanism")] },
    ],
    pictures: { [`${dir}/Thesis/route b.oct`]: { auto }, [tamiflu]: { own } },
  };
}

export async function answer(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  store ??= first();
  switch (cmd) {
    case "recent_list": return recents;
    case "recovery_list": return [];
    case "recent_remove": recents = recents.filter((r) => r.path !== args.path); return null;
    case "recent_thumb": return null;
    case "experiment_list": return experiments;
    case "experiment_remove": experiments = experiments.filter((x) => x.path !== args.path); return null;
    case "open_recent": {
      const r = recents.find((x) => x.path === args.path), text = STARTERS[r?.thumb === reaction ? 1 : r?.thumb === cycle ? 2 : 0].text;
      return [args.path, text];
    }
    case "home_read": {
      const paths = store.projects.flatMap((p) => p.drawings.map((d) => d.path));
      return { text: JSON.stringify(store), damaged: false, missing: paths.filter((p) => p.includes("Desktop")), home: "/Users/sam" };
    }
    case "home_write": store = JSON.parse(String(args.text)); return null;
    case "home_pick_drawings": return args.many ? [`${dir}/Downloads/heck scheme.cdxml`] : [`${dir}/Archive/old scheme.cdx`];
    case "home_pick_picture": return photo("plate", "image/png").split(",")[1];
    case "thumb_save": {
      const k = id();
      thumbs.set(k, args.jpeg ? `data:image/jpeg;base64,${args.jpeg}` : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(args.svg))}`);
      return k;
    }
    case "thumb_load": return Object.fromEntries((args.ids as string[]).flatMap((k) => (thumbs.has(k) ? [[k, thumbs.get(k)!]] : [])));
    case "thumb_drop": thumbs.delete(String(args.id)); return null;
  }
  throw new Error("Octet cannot do this in the preview.");
}
