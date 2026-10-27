import { describe, expect, test } from "bun:test";
import { readClipboardImage } from "../src/clipboard";

describe("剪贴板图片读取", () => {
  test("Copy image 同时带 HTML 和 PNG 时只读取图片", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const requested: string[] = [];
    const file = await readClipboardImage({ read: async () => [{
      types: ["text/html", "image/png"],
      getType: async type => { requested.push(type); return new Blob([bytes], { type }); },
    }] });
    expect(requested).toEqual(["image/png"]);
    expect(file.type).toBe("image/png");
    expect(file.name).toMatch(/^clipboard-\d{8}T\d{6}Z\.png$/);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  test("只有图片地址或空剪贴板时给出 Copy image 提示", async () => {
    const text = { types: ["text/plain"], getType: async () => { throw new Error("不应读取文本"); } };
    await expect(readClipboardImage({ read: async () => [text] })).rejects.toThrow("Copy image");
    await expect(readClipboardImage({ read: async () => [] })).rejects.toThrow("Copy image");
  });

  test("同一图片的多个编码只取一份，多张独立图片则提示重新选择", async () => {
    const item = { types: ["image/jpeg", "image/png"], getType: async (type: string) => new Blob(["image"], { type }) };
    expect((await readClipboardImage({ read: async () => [item] })).type).toBe("image/png");
    await expect(readClipboardImage({ read: async () => [item, item] })).rejects.toThrow("多张图片");
  });

  test("权限被拒绝时提示重新加载扩展或手动粘贴", async () => {
    await expect(readClipboardImage({ read: async () => { throw new DOMException("Denied", "NotAllowedError"); } })).rejects.toThrow("Ctrl+V");
  });

  test("剪贴板图片不可用或为空时明确报错", async () => {
    await expect(readClipboardImage({ read: async () => [{ types: ["image/png"], getType: async () => { throw new Error("Unavailable"); } }] })).rejects.toThrow("重新复制");
    await expect(readClipboardImage({ read: async () => [{ types: ["image/png"], getType: async () => new Blob([]) }] })).rejects.toThrow("为空");
  });
});
