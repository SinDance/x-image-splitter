type ImageClipboardItem = { types: readonly string[]; getType(type: string): Promise<Blob> };
type ImageClipboard = { read(): Promise<readonly ImageClipboardItem[]> };

/** 仅在用户点击按钮后调用；不读取 HTML 或文本中的图片网址。 */
export async function readClipboardImage(clipboard: ImageClipboard | undefined = navigator.clipboard): Promise<File> {
  if (!clipboard?.read) throw new Error("浏览器暂不支持直接读取剪贴板，请点击面板后按 Ctrl+V 粘贴图片。");
  let items: readonly ImageClipboardItem[];
  try { items = await clipboard.read(); }
  catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error("无法读取剪贴板。请重新加载扩展并刷新 X，允许剪贴板读取；也可以点击面板后按 Ctrl+V 粘贴。");
    }
    throw new Error("剪贴板读取失败，请重新复制图片后再试，或点击面板后按 Ctrl+V。");
  }
  const formats = ["image/png", "image/jpeg", "image/webp"] as const;
  const images = items.filter(item => formats.some(type => item.types.includes(type)));
  if (!images.length) throw new Error("剪贴板里没有图片。请在图片上右键选择“复制图片 / Copy image”，而不是“复制图片地址”。");
  if (images.length > 1) throw new Error("剪贴板中有多张图片，请只复制一张原图后再试。");
  const type = formats.find(type => images[0].types.includes(type))!;
  let blob: Blob;
  try { blob = await images[0].getType(type); }
  catch { throw new Error("无法取得剪贴板图片，请重新复制图片后再试。"); }
  if (!blob.size) throw new Error("剪贴板图片为空，请重新复制图片后再试。");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1];
  return new File([blob], `clipboard-${stamp}.${extension}`, { type });
}
