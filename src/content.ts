import { splitImage, type OutputFormat, type SliceResult } from "./image";
import { findComposer, addToComposer, waitForAttachments } from "./x-adapter";
import { readClipboardImage } from "./clipboard";

const HOST_ID = "x-four-slices";
if (!document.getElementById(HOST_ID)) mount();

function mount() {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;right:24px;bottom:96px;z-index:2147483647;color-scheme:dark;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
  :host{all:initial;font-family:system-ui,'Microsoft YaHei',sans-serif;color:#f3f5f7;font-size:14px}
  *{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}
  button:focus-visible,select:focus-visible{outline:2px solid #78d9b3;outline-offset:3px}
  .orb{display:flex;align-items:center;gap:8px;padding:13px 17px;border:1px solid #505b63;border-radius:30px;background:#182127;color:#eaf4ef;box-shadow:0 5px 22px #0006;touch-action:none}
  .bars{display:flex;gap:3px;height:20px}.bars i{width:4px;border-radius:2px;background:#8ce5bc}
  .panel{display:none;width:min(370px,calc(100vw - 24px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid #3a454d;border-radius:20px;background:#151d23;box-shadow:0 15px 60px #0009}
  .open .panel{display:block}.open .orb{display:none}
  header{display:flex;align-items:center;justify-content:space-between;padding:17px 20px;border-bottom:1px solid #2d383f;cursor:move;touch-action:none;user-select:none}
  header strong{font-size:17px;letter-spacing:.5px}header small{color:#8ce5bc;font-size:11px;margin-left:8px}
  .icon{border:0;color:#b8c7d1;background:transparent;font-size:23px;padding:0 5px}
  .body{padding:20px}.drop{width:100%;padding:28px 12px;border:1px dashed #52656e;border-radius:12px;color:#e4ecef;background:#1d2a31;text-align:center;line-height:1.8}
  .drop strong{display:block;font-size:16px}.drop span{font-size:12px;color:#a7bbc7}.drag .drop,.drag .orb{border-color:#8ce5bc;background:#244c40}
  .clipboard{display:block;width:100%;margin-top:10px;padding:11px 12px;border:1px solid #537c6b;border-radius:9px;background:#233d32;color:#baf3d8;font-weight:600}
  .clipboard:hover:not(:disabled){background:#2d4d3f}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:17px 0 14px;color:#b8c7d1;font-size:12px}
  select{background:#26343c;color:#e4ecef;border:1px solid #42535e;border-radius:6px;padding:5px}
  .preview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:15px}
  figure{margin:0;min-width:0}figure img{width:100%;height:150px;object-fit:contain;display:block;border-radius:5px;background:repeating-conic-gradient(#27343c 0 25%,#1c272e 0 50%) 0/14px 14px}
  figcaption{font-size:11px;text-align:center;padding-top:6px;color:#a7bbc7}
  .info{font-size:11px;color:#8da3b0;line-height:1.6;word-break:break-all;margin-top:12px}
  .status{font-size:12px;line-height:1.7;min-height:38px;margin:14px 0;color:#bfd1dc}.status.error{color:#ffb8a9}.status.ok{color:#8ce5bc}
  .primary{width:100%;border:0;border-radius:9px;padding:12px;background:#8ce5bc;color:#112e23;font-weight:700}
  .footer{display:flex;justify-content:space-between;align-items:center;margin-top:14px;color:#8da3b0;font-size:11px}
  .link{border:0;background:none;color:#a9c1ce;font-size:11px;padding:2px}
  </style>
  <div class="widget">
    <button class="orb" aria-label="打开四片切图面板" title="拖入横图，切成四张"><span class="bars"><i></i><i></i><i></i><i></i></span>四片</button>
    <section class="panel" aria-label="四片切图面板">
      <header><div><strong>四片</strong><small>FOR X</small></div><button class="icon" aria-label="收起面板">−</button></header>
      <div class="body">
        <button class="drop"><strong>把横图拖到这里</strong><span>或点击选择 · 面板内支持 Ctrl+V<br>JPG / PNG / WebP</span></button>
        <input class="picker" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <button class="clipboard" title="先在网页图片上右键 Copy image，再点击此按钮">读取剪贴板并切图</button>
        <div class="row"><span>从左到右 · 四等分</span><label>输出 <select aria-label="输出格式"><option value="auto">自动</option><option value="jpeg">JPG</option><option value="png">PNG</option></select></label></div>
        <div class="preview" aria-label="切图预览"></div><div class="info"></div>
        <div class="status" role="status" aria-live="polite">打开 X 发帖窗口，再选择一张图片。</div>
        <button class="primary" disabled>加入当前帖子 · 4 张</button>
        <div class="footer"><span>切图不下载到本地</span><button class="link">清空图片</button></div>
      </div>
    </section>
  </div>`;
  document.documentElement.append(host);
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const widget = get(".widget"), orb = get<HTMLButtonElement>(".orb");
  const picker = get<HTMLInputElement>(".picker"), format = get<HTMLSelectElement>("select");
  const add = get<HTMLButtonElement>(".primary"), drop = get<HTMLButtonElement>(".drop");
  const clipboardButton = get<HTMLButtonElement>(".clipboard");
  const preview = get(".preview"), info = get(".info"), status = get(".status");
  let source: File | null = null, result: SliceResult | null = null, urls: string[] = [];
  let generation = 0, sent = false, uploading = false, preferred: HTMLElement | null = null;
  let readingClipboard = false;
  const say = (text: string, type = "") => { status.textContent = text; status.className = `status ${type}`; };
  const open = () => { widget.classList.add("open"); clamp(); };
  const clearPreview = () => { urls.forEach(URL.revokeObjectURL); urls = []; preview.replaceChildren(); info.textContent = ""; result = null; add.disabled = true; };
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
  document.addEventListener("focusin", event => {
    if (event.target instanceof HTMLElement && event.target.matches('[contenteditable="true"][role="textbox"], [contenteditable="true"][data-testid^="tweetTextarea"]')) preferred = event.target;
  });
  async function prepare(file: File) {
    if (uploading) return;
    const ticket = ++generation;
    source = file; sent = false; clearPreview(); open();
    say("正在切图…");
    try {
      const next = await splitImage(file, format.value as OutputFormat);
      if (ticket !== generation) return;
      result = next;
      next.files.forEach((part, index) => {
        const figure = document.createElement("figure"), img = document.createElement("img"), caption = document.createElement("figcaption");
        img.src = URL.createObjectURL(part); urls.push(img.src); img.alt = `第 ${index + 1} 张切图`;
        caption.textContent = `${String(index + 1).padStart(2, "0")} · ${next.widths[index]} px`;
        figure.title = part.name; figure.append(img, caption); preview.append(figure);
      });
      info.textContent = `${file.name} · ${next.width} × ${next.height} → 4 张 · 共 ${(next.files.reduce((sum, part) => sum + part.size, 0) / 1024 / 1024).toFixed(2)} MB`;
      say("预览已就绪。点击下方按钮，加入 X 附件区。"); add.disabled = readingClipboard; clamp();
    } catch (error) { if (ticket === generation) say(errorText(error), "error"); }
  }
  function receive(files: File[]) {
    if (files.length !== 1) { open(); say("请一次放入一张原图，工具会自动切成四张。", "error"); return; }
    void prepare(files[0]);
  }
  orb.addEventListener("click", () => { if (!moved) open(); });
  get(".icon").addEventListener("click", () => { widget.classList.remove("open"); clamp(); });
  drop.addEventListener("click", () => picker.click());
  clipboardButton.addEventListener("click", async event => {
    // 内容脚本拥有 clipboardRead 权限，必须由真实用户点击触发。
    if (!event.isTrusted || uploading || readingClipboard) return;
    const ticket = ++generation;
    readingClipboard = true; clipboardButton.disabled = true; add.disabled = true;
    clipboardButton.textContent = "正在读取剪贴板…";
    say("正在读取剪贴板图片…");
    try {
      const file = await readClipboardImage();
      // 若用户已经清空或换了图片，不用较晚返回的剪贴板结果覆盖新选择。
      if (ticket === generation) await prepare(file);
    } catch (error) {
      if (ticket === generation) say(errorText(error), "error");
    } finally {
      readingClipboard = false; clipboardButton.disabled = uploading;
      clipboardButton.textContent = "读取剪贴板并切图";
      add.disabled = !result || sent || uploading;
    }
  });
  picker.addEventListener("change", () => { if (picker.files?.length) receive(Array.from(picker.files)); picker.value = ""; });
  format.addEventListener("change", () => { if (source) void prepare(source); });
  get(".link").addEventListener("click", () => {
    if (uploading) return;
    generation++; source = null; sent = false; clearPreview(); say("图片已清空，可以继续拖入下一张。");
  });
  // 在 window 捕获阶段截住落在面板上的文件，避免 X 先收到未切分的原图。
  for (const type of ["dragenter", "dragover", "drop"] as const) {
    window.addEventListener(type, (event: DragEvent) => {
      if (!event.composedPath().includes(host)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      widget.classList.add("drag");
      if (type === "drop") {
        widget.classList.remove("drag"); open();
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length) receive(files);
        else say("请拖入本地图片文件，或先复制图片再在面板内粘贴。", "error");
      }
    }, true);
  }
  host.addEventListener("dragleave", event => { if (!(event.relatedTarget instanceof Node) || !host.contains(event.relatedTarget)) widget.classList.remove("drag"); });
  root.addEventListener("paste", event => {
    const paste = event as ClipboardEvent;
    const files = Array.from(paste.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault(); event.stopPropagation(); receive(files);
  });
  root.addEventListener("keydown", event => event.stopPropagation());
  add.addEventListener("click", async () => {
    if (!result || sent || uploading || readingClipboard) return;
    let composer;
    try { composer = findComposer(preferred); addToComposer(composer, result.files); }
    catch (error) { say(errorText(error), "error"); return; }
    sent = true; uploading = true; add.disabled = true; format.disabled = true; drop.disabled = true; clipboardButton.disabled = true;
    say("已交给 X，正在等待四张附件预览…");
    try {
      const confirmed = await waitForAttachments(composer);
      say(confirmed ? "X 已显示四张切图。请检查排列，再自行发布。" : "已交给 X，但暂未确认四张预览。请检查 X 的附件区及报错，避免重复添加。", confirmed ? "ok" : "error");
    } finally { uploading = false; format.disabled = false; drop.disabled = false; clipboardButton.disabled = false; }
  });
  let moved = false;
  function clamp() {
    const bounds = host.getBoundingClientRect();
    const left = Math.max(8, Math.min(bounds.left, innerWidth - bounds.width - 8));
    const top = Math.max(8, Math.min(bounds.top, innerHeight - bounds.height - 8));
    host.style.left = `${left}px`; host.style.top = `${top}px`; host.style.right = host.style.bottom = "auto";
  }
  for (const handle of [orb, get("header")]) {
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".icon"))) return;
      moved = false;
      const start = host.getBoundingClientRect(), x = event.clientX, y = event.clientY;
      handle.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - x, e.clientY - y) < 5 && !moved) return;
        moved = true;
        host.style.left = `${start.left + e.clientX - x}px`; host.style.top = `${start.top + e.clientY - y}px`;
        host.style.right = host.style.bottom = "auto"; clamp();
      };
      const finish = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", finish); handle.removeEventListener("pointercancel", finish); };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", finish);
    });
  }
  window.addEventListener("resize", clamp);
}
