// Client-side easter egg: Konami code → download a zip of the app source.
// Bundles source text at build time via `?raw` so no server endpoint is needed.

const rawModules = import.meta.glob<string>(
  ["../routes/*.tsx", "../lib/*.ts", "../components/**/*.{ts,tsx}", "../hooks/**/*.{ts,tsx}", "../router.tsx", "../styles.css"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

export function onKonami(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let pos = 0;
  const handler = (e: KeyboardEvent) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const want = KONAMI[pos]!;
    const normalizedWant = want.length === 1 ? want.toLowerCase() : want;
    if (key === normalizedWant) {
      pos++;
      if (pos === KONAMI.length) {
        pos = 0;
        cb();
      }
    } else {
      // Restart if this key is the start of the sequence, else reset.
      pos = key === KONAMI[0] ? 1 : 0;
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}

export async function downloadSourceZip(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const entries = Object.entries(rawModules);
  const total = entries.length;
  onProgress?.(0, total);

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  let done = 0;
  for (const [path, content] of entries) {
    // "../routes/index.tsx" → "src/routes/index.tsx"
    const name = path.replace(/^\.\.\//, "src/");
    zip.file(name, content);
    done++;
    onProgress?.(done, total);
  }

  const blob = await zip.generateAsync({ type: "blob" });

  if (typeof document !== "undefined") {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "creamyviews-source.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return total;
}
