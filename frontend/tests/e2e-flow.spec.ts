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

test('Cryptographic visualization and search flow', async ({ page }) => {
  // 1. Navigate to read page
  console.log('Navigating to http://localhost:3000/read/Gen.1.1...');
  await page.goto('http://localhost:3000/read/Gen.1.1');

  // 2. Click a Hebrew word card (Microscope)
  console.log('Verifying interlinear word hover/click (Microscope)...');
  // Find the first inline Hebrew word element
  const wordCard = page.locator('[data-testid="hebrew-word"]').first();
  await expect(wordCard).toBeVisible({ timeout: 5000 });
  // Click on the word card to load it in the lexicon sidebar
  await wordCard.click();
  console.log('Clicked word card, checking Lexicon sidebar...');
  
  // Click View Cryptographic Analysis to open the full-screen page
  const analysisButton = page.locator('a:has-text("View Cryptographic Analysis")');
  await expect(analysisButton).toBeVisible({ timeout: 5000 });
  console.log('Navigating to dedicated word cryptography page...');
  await analysisButton.click();

  // Verify full-screen cryptographic dashboard is loaded
  await expect(page.locator('h1:has-text("Word Cryptographic Analysis")')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('span:has-text("Absolute Gematria")')).toBeVisible({ timeout: 5000 });

  // Return back to reader
  console.log('Returning to interlinear reader...');
  const returnButton = page.locator('a:has-text("Return to Interlinear Reading")');
  await expect(returnButton).toBeVisible({ timeout: 5000 });
  await returnButton.click();
  
  // 3. Verify Density Heatmap (Analytics)
  console.log('Checking Chapter Analytics (Density Heatmap)...');
  // Toggle the analytics section
  const toggleChartButton = page.locator('button:has-text("Show Chapter Analytics")');
  await expect(toggleChartButton).toBeVisible();
  await toggleChartButton.click();
  
  // Verify heatmap is shown
  const heatmap = page.locator('[data-testid="density-heatmap"]');
  await expect(heatmap).toBeVisible({ timeout: 5000 });
  
  // Toggle to average mode
  const avgButton = page.locator('button:has-text("Average")');
  await expect(avgButton).toBeVisible();
  await avgButton.click();
  
  // Toggle back to cumulative mode
  const cumButton = page.locator('button:has-text("Cumulative")');
  await expect(cumButton).toBeVisible();
  await cumButton.click();

  // 4. Navigate to /search
  console.log('Navigating to http://localhost:3000/search...');
  await page.goto('http://localhost:3000/search');

  // Switch to Cryptographic Search tab
  const cryptoTabButton = page.locator('button:has-text("Cryptographic Search")');
  await expect(cryptoTabButton).toBeVisible({ timeout: 5000 });
  await cryptoTabButton.click();

  // 5. Query absolute Gematria = 26 (Telescope)
  console.log('Executing Cryptographic Search for Absolute Gematria 26 (Telescope)...');
  const absInput = page.locator('input[placeholder="e.g. 26"]').first();
  await absInput.fill('26');
  
  const searchButton = page.locator('button:has-text("Execute Search")');
  await searchButton.click();

  // Verify results are loaded in the table
  console.log('Verifying search results table...');
  const resultsTable = page.locator('table');
  await expect(resultsTable).toBeVisible({ timeout: 10000 });
  
  // Verify that YHWH results show up (e.g. Gen.2.4)
  const yhwhRow = page.locator('td:has-text("Gen.2.4")').first();
  await expect(yhwhRow).toBeVisible({ timeout: 5000 });
  
  console.log('Cryptographic Search and Visualization flow completed successfully!');
});

