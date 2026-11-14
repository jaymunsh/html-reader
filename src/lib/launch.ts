// File handlers (§7.5): the installed app receives opened files through window.launchQueue (Chromium desktop only).
export interface LaunchQueueLike { setConsumer(cb: (params: { files?: readonly { getFile(): Promise<File> }[] }) => void): void }

export function initLaunch(queue: LaunchQueueLike | undefined, onFiles: (files: File[]) => void): void {
  queue?.setConsumer(async ({ files }) => {
    if (!files?.length) return;
    const got = (await Promise.allSettled(files.map((h) => h.getFile())))
      .flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (got.length) onFiles(got);
  });
}

export const isImportableName = (name: string): boolean => /\.(zip|html?)$/i.test(name);
