export type ImportErrorCode = 'not-zip' | 'corrupt' | 'multi-disk' | 'encrypted' | 'unsupported-method' | 'crc-mismatch'
  | 'no-html' | 'too-large' | 'bomb' | 'quota' | 'unsupported-file' | 'cancelled' | 'failed';

import { ZipError } from '../zip';

export class ImportError extends Error {
  constructor(public code: ImportErrorCode, public detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ImportError';
  }
}

const CORRUPT = '파일이 손상되었거나 ZIP 형식이 아닙니다.';
const HUGE = '압축을 풀었을 때 크기가 비정상적으로 큽니다. 가져오기를 중단했습니다.';

const MESSAGES: Record<ImportErrorCode, string> = {
  'not-zip': CORRUPT,
  corrupt: CORRUPT,
  'crc-mismatch': CORRUPT,
  'multi-disk': '분할 압축 ZIP은 지원하지 않습니다.',
  encrypted: '암호가 걸린 ZIP은 열 수 없습니다. 암호를 풀고 다시 압축해 주세요.',
  'unsupported-method': '지원하지 않는 압축 방식입니다(Deflate64 등). 일반 ZIP으로 다시 압축해 주세요.',
  'no-html': 'HTML 파일이 없는 묶음입니다.',
  'too-large': HUGE,
  bomb: HUGE,
  quota: '저장 공간이 부족합니다. 서재에서 문서를 지우고 다시 시도해 주세요.',
  'unsupported-file': 'ZIP 또는 HTML 파일만 가져올 수 있습니다.',
  cancelled: '가져오기를 취소했습니다.',
  failed: '가져오지 못했습니다. 파일이 너무 크면 기기 메모리가 부족할 수 있습니다.',
};

export function importErrorMessage(code: ImportErrorCode): string {
  return MESSAGES[code];
}

export function toImportError(e: unknown): ImportError {
  if (e instanceof ImportError) return e;
  if (e instanceof ZipError) return new ImportError(e.code as ImportErrorCode, e.message);
  if (e instanceof DOMException && e.name === 'QuotaExceededError') return new ImportError('quota', e.message);
  return new ImportError('failed', e instanceof Error ? e.message : String(e));
}
