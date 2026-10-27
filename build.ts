import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
const root = import.meta.dir;
const outdir = path.join(root, "extension");
await mkdir(outdir, { recursive: true });
const result = await Bun.build({ entrypoints: [path.join(root, "src/content.ts")], outdir, target: "browser", format: "iife", minify: false });
if (!result.success) throw new Error(result.logs.join("\n"));
await copyFile(path.join(root, "manifest.json"), path.join(outdir, "manifest.json"));
// 项目根目录也包含 manifest.json，因此同步入口文件，两个目录均可直接加载。
await copyFile(path.join(outdir, "content.js"), path.join(root, "content.js"));
console.log(`扩展已构建，可直接加载项目目录：${root}`);
console.log(`独立扩展目录也可加载：${outdir}`);
