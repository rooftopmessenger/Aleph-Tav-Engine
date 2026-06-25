import { test, expect } from '@playwright/test';

test('E2E auth and note-creation flow', async ({ page }) => {
  const email = 'test_auto@example.com';
  const password = 'password123';
  const noteText = 'Automated test note #peshat';

  // Listen for console logs, network errors or CORS failures
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error] ${msg.text()}`);
    }
  });

  page.on('requestfailed', request => {
    console.log(`[Request Failed] URL: ${request.url()} | Error: ${request.failure()?.errorText || 'Unknown error'}`);
  });

  // 1. Navigate to home
  console.log('Navigating to http://localhost:3000...');
  try {
    await page.goto('http://localhost:3000', { timeout: 10000 });
  } catch (err: any) {
    console.error('Failed to load frontend at http://localhost:3000. Is next dev server running?', err.message);
    throw err;
  }

  // 2. Open Auth Modal
  console.log('Opening Auth Modal...');
  const authTrigger = page.locator('header button:has-text("Sign In / Sign Up")');
  await expect(authTrigger).toBeVisible({ timeout: 5000 });
  await authTrigger.click();

  // 3. Switch to Sign Up
  console.log('Toggling to Sign Up form...');
  const toggleButton = page.locator('button:has-text("Create one here")');
  await expect(toggleButton).toBeVisible();
  await toggleButton.click();

  // 4. Fill in Credentials
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  // Set up network interceptor for the signup request
  const signupResponsePromise = page.waitForResponse(
    response => response.url().includes('/api/auth/signup') && response.request().method() === 'POST',
    { timeout: 5000 }
  );

  // 5. Submit Sign Up
  console.log('Submitting Sign Up...');
  const signUpButton = page.locator('button[type="submit"]:has-text("Sign Up")');
  await expect(signUpButton).toBeVisible();
  await signUpButton.click();

  // Wait for the signup response
  const signupResponse = await signupResponsePromise;
  console.log(`Signup HTTP Response Status: ${signupResponse.status()}`);

  if (signupResponse.status() === 400) {
    const errBody = await signupResponse.json();
    if (errBody.detail === "Email address already registered.") {
      console.log('User test_auto@example.com already exists. Switching to Sign In flow...');
      
      // Toggle to login
      await page.locator('button:has-text("Sign in instead")').click();
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      
      // Click Sign In
      console.log('Submitting Sign In...');
      await page.locator('button[type="submit"]:has-text("Sign In")').click();
    }
  }

  // Verify successful authentication (the Sign In / Sign Up button should disappear)
  console.log('Verifying authentication success...');
  await expect(page.locator('header button:has-text("Sign In / Sign Up")')).not.toBeVisible({ timeout: 8000 });
  console.log('Authentication successful!');

  // 6. Navigate to /read/Gen.1.1
  console.log('Navigating to http://localhost:3000/read/Gen.1.1...');
  await page.goto('http://localhost:3000/read/Gen.1.1');

  // 7. Write and save note
  console.log('Locating note textarea...');
  const textarea = page.locator('textarea[placeholder*="Write your theological thoughts"]');
  await expect(textarea).toBeVisible({ timeout: 5000 });
  await textarea.fill(noteText);

  console.log('Saving note...');
  const saveButton = page.locator('button:has-text("Save Note")');
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  // 8. Verify note appears in the list
  console.log('Verifying note is visible in the UI...');
  const noteSelector = page.locator('p', { hasText: noteText }).first();
  await expect(noteSelector).toBeVisible({ timeout: 8000 });
  console.log('E2E Test Flow completed successfully!');
});
