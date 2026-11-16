import { expect, test } from '@playwright/test';
import { importFixture, openBook } from './helpers';
const top = (f: any) => f.evaluate(() => document.scrollingElement!.scrollTop);

test('PC: 문서를 열거나 쪽을 넘기면 클릭 없이 키보드로 스크롤된다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await page.keyboard.press('PageDown');
  await expect.poll(() => top(f)).toBeGreaterThan(0);
  await page.keyboard.press(']');                                                       // 다음 쪽(문서 안에서 받은 단축키)
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'noref.html');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await page.keyboard.press('[');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await expect.poll(() => top(f)).toBe(0);
  await page.keyboard.press('PageDown');
  await expect.poll(() => top(f)).toBeGreaterThan(0);
});

test('PC: 셸 입력란의 포커스는 쪽이 바뀌어도 빼앗지 않는다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  const input = page.getByTestId('search-input');
  await input.focus();
  await expect(input).toBeFocused();
  await f.evaluate(() => location.replace('page2.html'));
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await page.waitForTimeout(200);
  await expect(input).toBeFocused();
});
