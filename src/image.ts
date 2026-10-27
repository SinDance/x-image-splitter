export type OutputFormat = "auto" | "png" | "jpeg";
export type SliceResult = { files: File[]; width: number; height: number; widths: number[] };

export async function splitImage(file: File, format: OutputFormat = "auto"): Promise<SliceResult> {
  if (!file.size || file.size > 50 * 1024 * 1024) throw new Error("请选择不超过 50 MB 的静态图片。");
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...header.slice(start, end));
  const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const png = header[0] === 137 && ascii(1, 4) === "PNG";
  const webp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("支持 JPG / JPEG、PNG 和 WebP 图片。");
  if (webp && ascii(12, 16) === "VP8X" && (header[20] & 2)) {
    throw new Error("这是动态 WebP，请先选择静态图片。");
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("无法读取图片，请检查文件是否完整。"); }
  try {
    const { width, height } = bitmap;
    if (width < 4) throw new Error("图片宽度至少需要 4 像素。");
    if (width * height > 80_000_000) throw new Error("图片超过 8000 万像素，请先缩小原图。");
    // X 版只输出通用的 JPEG / PNG，WebP 默认转 PNG，保留透明像素。
    const type = format === "jpeg" || (format === "auto" && jpeg) ? "image/jpeg" : "image/png";
    const extension = type === "image/jpeg" ? "jpg" : "png";
    const stem = (file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 100) || "image");
    const files: File[] = [];
    const widths: number[] = [];
    for (let i = 0; i < 4; i++) {
      const left = Math.floor(width * i / 4);
      const sliceWidth = Math.floor(width * (i + 1) / 4) - left;
      const canvas = document.createElement("canvas");
      canvas.width = sliceWidth; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法创建绘图画布。");
      if (type === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, sliceWidth, height);
      }
      context.drawImage(bitmap, left, 0, sliceWidth, height, 0, 0, sliceWidth, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("图片编码失败。")), type, 0.95,
      ));
      canvas.width = canvas.height = 0;
      if (blob.size > 5_000_000) throw new Error(`第 ${i + 1} 张超过 5 MB，请选择 JPG 输出或缩小原图后重试。`);
      files.push(new File([blob], `${String(i + 1).padStart(2, "0")}_${stem}.${extension}`, { type: blob.type }));
      widths.push(sliceWidth);
    }
    return { files, width, height, widths };
  } finally { bitmap.close(); }
}
