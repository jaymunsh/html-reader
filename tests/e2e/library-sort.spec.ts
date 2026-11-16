import { expect, test } from '@playwright/test';
import { backToLibrary, holdImports, idbAll, importFixture, openBook, scrollFrameTo, releaseImports, startImport } from './helpers';
const order = (page: any) => page.getByTestId('book-card').evaluateAll((els: Element[]) => els.map((e) => e.getAttribute('data-title')));

test('서재 검색·정렬, 마지막 선택 저장', async ({ page }) => {
  await page.goto('/');
  const single = await importFixture(page, '10-single.html');
  await importFixture(page, '01-multipage.zip');
  await importFixture(page, '06-euckr.zip');
  const f = await openBook(page, single); await scrollFrameTo(f, 1); await backToLibrary(page);

  await expect(page.locator('[data-testid=sort-chip][data-sort="recent"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByTestId('sort-chip').evaluateAll((e: Element[]) => e.map((x) => x.textContent!.trim()))).toEqual(['최근 읽음', '이름', '진행률', '가져온 날짜']);
  await expect.poll(() => order(page).then((o: string[]) => o[0])).toBe('10-single');
  await page.locator('[data-testid=sort-chip][data-sort="name"]').click();
  await expect.poll(() => order(page)).toEqual(['10-single', '여러 쪽 문서', '한글 문서']);
  await page.locator('[data-testid=sort-chip][data-sort="imported"]').click();
  await expect.poll(() => order(page)).toEqual(['한글 문서', '여러 쪽 문서', '10-single']);
  await page.locator('[data-testid=sort-chip][data-sort="progress"]').click();
  await expect.poll(() => order(page).then((o: string[]) => o[0])).toBe('10-single');
  await expect.poll(async () => (await idbAll(page, 'settings')).includes('progress')).toBe(true);   // K14: setSetting is async
  await page.reload();
  await expect(page.locator('[data-testid=sort-chip][data-sort="progress"]')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('library-search').fill('문서');
  await expect.poll(() => order(page).then((o: string[]) => o.sort())).toEqual(['여러 쪽 문서', '한글 문서']);
  await page.getByTestId('library-search').fill('EUCKR');
  await expect.poll(() => order(page)).toEqual(['한글 문서']);
  await page.getByTestId('library-search').fill('없는이름');
  await expect(page.getByText('일치하는 문서가 없습니다')).toBeVisible();

  // K13: while importing, the progress replaces the input; the query is kept.
  await page.getByTestId('library-search').fill('EUCKR');
  await holdImports(page);
  await startImport(page, 'big.zip');
  await expect(page.getByTestId('import-progress')).toBeVisible();
  await expect(page.getByTestId('library-search')).toHaveCount(0);
  await releaseImports(page);
  await expect(page.getByTestId('import-progress')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('library-search')).toHaveValue('EUCKR');
});
