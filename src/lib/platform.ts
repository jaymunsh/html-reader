export function isIos(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

export function isStandalone(win: Window = window): boolean {
  return (win.navigator as Navigator & { standalone?: boolean }).standalone === true
    || win.matchMedia('(display-mode: standalone)').matches;
}

export function needsIosTabNotice(ua: string, maxTouchPoints: number, standalone: boolean): boolean {
  return isIos(ua, maxTouchPoints) && !standalone;
}
