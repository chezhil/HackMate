// Renders brand/logo.svg into the icon files Next serves from src/app: favicon.ico, icon.svg and apple-icon.png.
// Run with: node brand/build-icons.mjs
import { copyFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const svg = fileURLToPath(new URL("./logo.svg", import.meta.url));
const app = new URL("../src/app/", import.meta.url);
const png = (size) => sharp(svg, { density: 72 * (size / 64) * 2 }).resize(size, size).png().toBuffer();

// An .ico holding PNG images (supported by every current browser).
async function ico(sizes) {
  const images = await Promise.all(sizes.map((s) => png(s)));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

writeFileSync(new URL("favicon.ico", app), await ico([16, 32, 48]));
copyFileSync(svg, new URL("icon.svg", app));
// The home-screen icon sits on the cream page colour, since iOS fills transparency with black.
const apple = await sharp({ create: { width: 180, height: 180, channels: 4, background: "#fff4d6" } })
  .composite([{ input: await png(148), left: 16, top: 16 }])
  .png()
  .toBuffer();
writeFileSync(new URL("apple-icon.png", app), apple);
console.log("icons written");
