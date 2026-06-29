import { test, expect } from '@playwright/test';

test('UI Onboarding and Help Tooltips verification', async ({ page }) => {
  // Listen for browser logs
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error] ${msg.text()}`);
    }
  });

  // Navigate to home page
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');

  // 1. Verify 'Getting Started' modal is present
  console.log('Checking presence of Getting Started modal...');
  const modal = page.locator('[data-testid="getting-started-modal"]');
  await expect(modal).toBeVisible();

  // Verify modal title content
  await expect(modal.locator('h3')).toContainText('Getting Started with Aleph-Tav');

  // Dismiss modal
  console.log('Dismissing onboarding modal...');
  await modal.locator('button:has-text("Explore Engine")').click();
  await expect(modal).not.toBeVisible();

  // 2. Assert help icons exist on Atbash, ELS, and Temurah components
  console.log('Checking visibility of help "?" icons...');
  const atbashHelp = page.locator('[data-testid="atbash-help"]');
  const elsHelp = page.locator('[data-testid="els-help"]');
  const temurahHelp = page.locator('[data-testid="temurah-help"]');

  await expect(atbashHelp).toBeVisible();
  await expect(elsHelp).toBeVisible();
  await expect(temurahHelp).toBeVisible();

  // 3. Hover over '?' icons and verify corresponding tooltip appears
  console.log('Hovering over Atbash help icon...');
  await atbashHelp.hover();
  const atbashTooltip = page.locator('text=Atbash is a monoalphabetic substitution cipher');
  await expect(atbashTooltip).toBeVisible();

  console.log('Hovering over ELS help icon...');
  await elsHelp.hover();
  const elsTooltip = page.locator('text=Equidistant Letter Sequence (ELS)');
  await expect(elsTooltip).toBeVisible();

  console.log('Hovering over Temurah help icon...');
  await temurahHelp.hover();
  const temurahTooltip = page.locator('text=Temurah locates anagram matches');
  await expect(temurahTooltip).toBeVisible();

  console.log('Playwright UI Refinement tests passed successfully.');
});

test('Paleo-Hebrew Pictographic Breakdown verification', async ({ page }) => {
  // Listen for browser logs
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error] ${msg.text()}`);
    }
  });

  // Navigate to Babylon cryptography page (word ID 262102)
  console.log('Navigating to http://localhost:3000/cryptography/262102...');
  await page.goto('http://localhost:3000/cryptography/262102');

  // 1. Verify "Paleo-Hebrew Pictographic Breakdown" panel exists
  console.log('Checking presence of Paleo-Hebrew Pictographic Breakdown panel...');
  const panel = page.locator('h3:has-text("Paleo-Hebrew Pictographic Breakdown")');
  await expect(panel).toBeVisible({ timeout: 10000 });

  // 2. Verify that it contains Paleo-Hebrew glyph elements with data-testid="paleo-glyph"
  console.log('Verifying Paleo-Hebrew glyph styling and rendering...');
  const glyph = page.locator('[data-testid="paleo-glyph"]').first();
  await expect(glyph).toBeVisible();
  
  // Verify font-family property on the glyph container contains 'PaleoHebrew'
  const fontFamily = await glyph.evaluate(el => window.getComputedStyle(el).fontFamily);
  console.log(`Found glyph font-family: ${fontFamily}`);
  expect(fontFamily).toContain('PaleoHebrew');

  // 3. Verify Word-Level Ideographic Synthesis text contains the formula for Bet (Babylon starts with Bet)
  console.log('Checking Word-Level Ideographic Synthesis...');
  const synthesis = page.locator('span:has-text("Word-Level Ideographic Synthesis")');
  await expect(synthesis).toBeVisible();
  
  const synthesisText = page.locator('p:has-text("Bet [ב]")');
  await expect(synthesisText).toBeVisible();

  // 4. Verify Overlay Modal Paleo-Hebrew Decoder
  console.log('Navigating to http://localhost:3000/read/Gen.1.1 to verify Overlay Modal integration...');
  await page.goto('http://localhost:3000/read/Gen.1.1');
  
  // Dismiss onboarding modal if visible
  const modal = page.locator('[data-testid="getting-started-modal"]');
  try {
    await expect(modal).toBeVisible({ timeout: 2000 });
    await modal.locator('button:has-text("Explore Engine")').click();
    await expect(modal).not.toBeVisible();
    console.log('Onboarding modal dismissed.');
  } catch (e) {
    console.log('Onboarding modal not visible or already dismissed.');
  }

  // Click the first Hebrew word to open the Lexicon overlay modal
  console.log('Clicking first Hebrew word card to select it...');
  const wordCard = page.locator('[data-testid="hebrew-word"]').first();
  await expect(wordCard).toBeVisible({ timeout: 5000 });
  await wordCard.click();

  // Verify that the overlay modal wrapper is visible
  console.log('Verifying Overlay Modal container is visible...');
  const overlay = page.locator('.fixed.inset-0.z-50');
  await expect(overlay).toBeVisible({ timeout: 5000 });

  // Verify that the Paleo-Hebrew Decoder header is visible inside overlay
  const overlayDecoderHeader = overlay.locator('h3:has-text("Paleo-Hebrew Pictographic Breakdown")');
  await expect(overlayDecoderHeader).toBeVisible({ timeout: 5000 });

  // Verify that it contains Paleo-Hebrew glyph elements
  const overlayGlyphs = overlay.locator('[data-testid="paleo-glyph"]');
  await expect(overlayGlyphs.first()).toBeVisible();

  // Verify font-family inside the overlay glyphs
  const overlayGlyphFont = await overlayGlyphs.first().evaluate(el => window.getComputedStyle(el).fontFamily);
  console.log(`Found overlay glyph font-family: ${overlayGlyphFont}`);
  expect(overlayGlyphFont).toContain('PaleoHebrew');

  // Verify sidebar fallback text
  console.log('Checking sidebar fallback text...');
  const fallbackText = page.locator('p:has-text("Lexicon definition is active in the full-page overlay.")');
  await expect(fallbackText).toBeVisible({ timeout: 5000 });

  // Close the modal by clicking the close button
  console.log('Closing overlay modal...');
  const closeBtn = page.locator('button[aria-label="Close"]');
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();

  // Verify that the overlay is dismissed
  await expect(overlay).not.toBeVisible({ timeout: 5000 });

  console.log('Paleo-Hebrew Pictographic Breakdown tests passed successfully.');
});

