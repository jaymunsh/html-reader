import { expect, test } from 'vitest';
import { initLaunch, isImportableName } from '../../src/lib/launch';

test('launchQueue 소비자: 핸들을 File로 바꿔 넘긴다', async () => {
  let consumer: any; const got: string[][] = [];
  initLaunch({ setConsumer: (cb) => { consumer = cb; } }, (files) => got.push(files.map((f) => f.name)));
  const h = (name: string) => ({ getFile: async () => new File(['x'], name) });
  consumer({ files: [h('a.zip'), h('b.html')] });
  consumer({ files: [] }); consumer({});
  await new Promise((r) => setTimeout(r, 0));
  expect(got).toEqual([['a.zip', 'b.html']]);
});
test('launchQueue가 없는 브라우저', () => expect(() => initLaunch(undefined, () => {})).not.toThrow());
test('isImportableName', () => expect(['a.ZIP', 'b.htm', 'c.html', 'd.pdf', 'zip'].map(isImportableName)).toEqual([true, true, true, false, false]));
