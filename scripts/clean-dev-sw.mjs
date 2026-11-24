import fs from "node:fs";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  for (const entry of fs.readdirSync(publicDir)) {
    if (
      entry === "sw.js" ||
      entry === "sw.js.map" ||
      entry.startsWith("swe-worker-") ||
      entry.startsWith("workbox-")
    ) {
      try {
        fs.unlinkSync(path.join(publicDir, entry));
      } catch {
        // Ignore if file was already removed
      }
    }
  }
}
