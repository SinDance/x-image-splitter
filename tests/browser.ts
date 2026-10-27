import { splitImage } from "../src/image";
import { findComposer, addToComposer } from "../src/x-adapter";

const log = document.querySelector<HTMLElement>("#results")!;
function assert(value: unknown, text: string) { if (!value) throw new Error(text); }
async function sample(type = "image/png", transparent = false): Promise<File> {
  const canvas = document.createElement("canvas"); canvas.width = 101; canvas.height = 65;
  const context = canvas.getContext("2d")!;
  if (!transparent) for (let x = 0; x < 101; x++) { context.fillStyle = `rgb(${x * 2},${200 - x},${x})`; context.fillRect(x, 0, 1, 65); }
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), type, .95));
  return new File([blob], `横图 sample.${type.split("/")[1]}`, { type });
}
function fixture(id: string, dialog = false) {
  const section = document.createElement("section"); section.id = id;
  if (dialog) section.setAttribute("role", "dialog");
  section.innerHTML = `<div role="textbox" contenteditable="true" aria-label="本地模拟帖子">测试编辑框</div><input type="file" multiple accept="image/jpeg,image/png"><div class="media"></div>`;
  document.querySelector("#stage")!.append(section); return section;
}
const demo = fixture("demo");
const demoInput = demo.querySelector("input")!;
demoInput.addEventListener("change", () => {
  const media = demo.querySelector(".media")!;
  media.replaceChildren();
  for (const file of Array.from(demoInput.files ?? [])) {
    const photo = document.createElement("div"); photo.dataset.testid = "tweetPhoto";
    const img = document.createElement("img"); img.src = URL.createObjectURL(file); img.alt = file.name;
    photo.append(img, document.createTextNode(file.name)); media.append(photo);
  }
});
document.querySelector("#sample")!.addEventListener("click", async () => {
  demoInput.value = ""; demo.querySelector(".media")!.replaceChildren();
  const transfer = new DataTransfer(); transfer.items.add(await sample());
  document.querySelector("#x-four-slices")!.shadowRoot!.querySelector(".orb")!.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, composed: true }));
});

document.querySelector<HTMLButtonElement>("#run")!.onclick = async () => {
  log.textContent = "运行中…"; demo.hidden = true;
  let passed = 0;
  const pass = (message: string) => { passed++; log.textContent += `\n✓ ${message}`; };
  try {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      const result = await splitImage(await sample(type));
      assert(result.files.length === 4 && result.widths.join(",") === "25,25,25,26", "奇数宽度分割错误");
      assert(result.files.every((file, i) => file.name.startsWith(`0${i + 1}_`)), "命名顺序错误");
      for (const file of result.files) {
        const bitmap = await createImageBitmap(file);
        assert(bitmap.height === 65, "高度改变"); bitmap.close();
        assert(file.type === (type === "image/jpeg" ? "image/jpeg" : "image/png"), "输出格式错误");
      }
      pass(`${type}：4 张、奇数宽度完整覆盖、格式及文件名正确`);
    }
    const original = await sample();
    const parts = await splitImage(original);
    const readPixels = async (file: File) => {
      const bitmap = await createImageBitmap(file), canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!; context.drawImage(bitmap, 0, 0); bitmap.close();
      return context.getImageData(0, 0, canvas.width, 1).data;
    };
    const merged = new Uint8Array((await Promise.all(parts.files.map(readPixels))).flatMap(data => Array.from(data)));
    const expected = await readPixels(original);
    assert(merged.length === expected.length && merged.every((v, i) => v === expected[i]), "像素缺失或排序错误");
    pass("PNG 切图重新拼接与原图逐像素一致");
    const transparent = await sample("image/png", true);
    assert((await readPixels((await splitImage(transparent)).files[0]))[3] === 0, "透明度丢失");
    const white = await readPixels((await splitImage(transparent, "jpeg")).files[0]);
    assert(white[0] > 250 && white[1] > 250 && white[2] > 250 && white[3] === 255, "JPEG 透明背景未铺白");
    pass("PNG 透明度保留，转 JPG 使用白色背景");
    let rejected = false;
    try { await splitImage(new File(["not an image"], "fake.png")); } catch { rejected = true; }
    assert(rejected, "无效格式未拒绝"); pass("损坏或伪装扩展名的文件会被拒绝");
    const background = fixture("background");
    const modal = fixture("modal", true);
    const composer = findComposer();
    assert(modal.contains(composer.input), "未选中弹窗编辑框");
    let received: File[] = [];
    composer.input.addEventListener("change", () => { received = Array.from(composer.input.files ?? []); });
    addToComposer(composer, parts.files);
    assert(received.length === 4 && received.every((file, i) => file.name === parts.files[i].name), "上传顺序错误");
    pass("弹窗优先选择，四个内存文件按顺序送入 change 事件");
    rejected = false;
    try { addToComposer(composer, parts.files); } catch { rejected = true; }
    assert(rejected, "没有阻止已有附件的帖子"); pass("已有附件时阻止重复添加");
    background.remove(); modal.remove();
    log.textContent += `\n\nPASS：${passed} 项检查通过`;
  } catch (error) { log.textContent += `\nFAIL：${String(error)}`; }
  finally { document.querySelectorAll("#background,#modal").forEach(node => node.remove()); demo.hidden = false; }
};
