// End-to-end test: drives a real browser against the running app.
// Locally it starts the server itself; in CI/CD it can target a deployed
// environment by setting BASE_URL (used as a post-deployment smoke test).
const { test, expect } = require('@playwright/test');
const path = require('node:path');

const VIDEO = path.join(__dirname, 'fixtures', 'sample.mp4');

test('home page loads and shows the build version', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ClipWave/ })).toBeVisible();
  await expect(page.locator('#version')).toContainText('rev');
});

test('user can sign up, upload a video, like and comment on it', async ({ page }) => {
  const user = `e2e_${Date.now().toString(36)}`;
  const caption = `E2E clip ${Date.now()}`;
  await page.goto('/');

  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: /Sign up/ }).click();
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password').fill('password123');
  await page.locator('#authSubmit').click();
  await expect(page.locator('#whoami')).toHaveText(`@${user}`);

  await page.getByRole('button', { name: '+ Upload' }).click();
  await page.getByLabel(/Video file/).setInputFiles(VIDEO);
  await page.getByLabel('Caption').fill(caption);
  await page.getByRole('button', { name: 'Post' }).click();

  const card = page.locator('.card', { hasText: caption });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Like' }).click();
  await expect(card.locator('.like')).toHaveClass(/liked/);
  await expect(card.locator('.like .count')).toHaveText('1');

  await card.getByRole('button', { name: 'Comments' }).click();
  await page.getByLabel('Comment', { exact: true }).fill('Great video!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('#commentList')).toContainText('Great video!');
});
