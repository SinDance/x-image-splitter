import path from "node:path";
const root = import.meta.dir;
const built = await Bun.build({ entrypoints: [path.join(root, "tests/browser.ts")], target: "browser", format: "esm" });
if (!built.success) throw new Error(built.logs.join("\n"));
const bundle = await built.outputs[0].text();
Bun.serve({ hostname: "127.0.0.1", port: 48424, fetch(request) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/browser.js") return new Response(bundle, { headers: { "content-type": "text/javascript" } });
  if (pathname === "/content.js") return new Response(Bun.file(path.join(root, "extension/content.js")));
  if (pathname === "/") return new Response(Bun.file(path.join(root, "tests/index.html")));
  return new Response("Not found", { status: 404 });
} });
console.log("本地验收：http://127.0.0.1:48424");
