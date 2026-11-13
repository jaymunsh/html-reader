import { expect, test } from '@playwright/test';
import { fixture } from './helpers';

test('iOS Safari 탭: 홈 화면 추가 안내 → 탭에서 계속 → 임시 보관 경고', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone 프리셋 전용');
  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles(fixture('10-single.html'));
  await expect(page.getByTestId('ios-notice')).toBeVisible();
  await expect(page.getByTestId('book-card')).toHaveCount(0);               // 안내를 통과하기 전에는 가져오지 않는다
  await page.getByTestId('ios-continue-tab').click();
  await expect(page.getByTestId('ios-temp-warning')).toContainText('임시 보관 — 홈 화면 앱에서는 보이지 않으며 지워질 수 있음');
  await page.getByTestId('ios-temp-ok').click();
  await page.getByTestId('confirm-ok').click();                             // 고지
  await expect(page.getByTestId('book-card')).toHaveCount(1);
});

test('Android에서는 iOS 안내가 뜨지 않는다', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Pixel 프리셋 전용');
  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles(fixture('10-single.html'));
  await expect(page.getByTestId('safety-notice')).toBeVisible();
  await expect(page.getByTestId('ios-notice')).toHaveCount(0);
});
