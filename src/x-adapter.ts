export type Composer = { editor: HTMLElement; scope: HTMLElement; input: HTMLInputElement };
const editorsSelector = '[contenteditable="true"][role="textbox"], [contenteditable="true"][data-testid^="tweetTextarea"]';
const fileSelector = 'input[type="file"]';
const visible = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";

export function findComposer(preferred?: HTMLElement | null): Composer {
  let editors = Array.from(document.querySelectorAll<HTMLElement>(editorsSelector)).filter(visible);
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(visible);
  if (dialogs.length) {
    const inDialogs = editors.filter(editor => dialogs.some(dialog => dialog.contains(editor)));
    if (inDialogs.length) editors = inDialogs;
    else throw new Error("请先关闭当前弹窗，再打开 X 的发帖窗口。");
  }
  const selected = preferred && editors.includes(preferred) ? preferred : editors.length === 1 ? editors[0] : null;
  if (!selected) throw new Error(editors.length ? "请先点击要添加图片的那一条帖子输入框。" : "请先打开 X 的发帖窗口，再点击加入。");
  // 找到只包含当前编辑框的最近上传区域；避免误选头像或另一条帖子。
  for (let scope = selected.parentElement; scope && scope !== document.body; scope = scope.parentElement) {
    if (scope.querySelectorAll(editorsSelector).length > 1) break;
    const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>(fileSelector))
      .filter(input => /image\//i.test(input.accept));
    if (inputs.length === 1) return { editor: selected, scope, input: inputs[0] };
    if (inputs.length > 1) break;
  }
  throw new Error("没有找到当前帖子的图片上传控件。请刷新 X 后重试。");
}

export function attachmentCount(scope: HTMLElement): number {
  const photos = Array.from(scope.querySelectorAll('[data-testid="tweetPhoto"]')).filter(visible);
  if (photos.length) return photos.length;
  return Array.from(scope.querySelectorAll('[data-testid="attachments"] img')).filter(visible).length;
}

export function addToComposer(composer: Composer, files: File[]): void {
  const { input, scope } = composer;
  if (!input.isConnected || !scope.isConnected) throw new Error("发帖窗口已变化，请重新选择输入框。");
  if (files.length !== 4) throw new Error("X 版需要四张切图。");
  if (input.disabled) throw new Error("X 当前无法添加图片，请先检查发帖窗口。");
  if (!input.multiple) throw new Error("这个上传控件不支持多图，请打开普通发帖窗口。");
  if (input.files?.length || attachmentCount(scope) || scope.querySelector('[data-testid="attachments"], video, [data-testid="videoPlayer"]')) {
    throw new Error("当前帖子已有媒体附件。四张切图需要空的附件区，请先移除原附件或新建帖子。");
  }
  const transfer = new DataTransfer();
  files.forEach(file => transfer.items.add(file));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function waitForAttachments(composer: Composer, timeout = 15000): Promise<boolean> {
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (value: boolean) => { clearTimeout(timer); observer.disconnect(); resolve(value); };
    const check = () => { if (attachmentCount(composer.scope) >= 4) finish(true); };
    const observer = new MutationObserver(check);
    observer.observe(composer.scope, { childList: true, subtree: true, attributes: true });
    timer = setTimeout(() => finish(false), timeout);
    check();
  });
}
