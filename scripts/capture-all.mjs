import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { execSync, spawn } from 'child_process';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

// Start the dev server as a child process
console.log('Starting dev server...');
const server = spawn('npx', ['next', 'dev', '-p', '3111'], {
  cwd: new URL('../frontend', import.meta.url).pathname,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NEXTAUTH_SECRET: 'dev-capture-secret' },
});

let serverReady = false;
server.stdout.on('data', (d) => {
  const s = d.toString();
  if (s.includes('Ready') || s.includes('ready')) {
    serverReady = true;
    console.log('Server is ready!');
  }
});
server.stderr.on('data', (d) => process.stderr.write(d));

// Wait for server to be ready
console.log('Waiting for server...');
for (let i = 0; i < 60 && !serverReady; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  process.stdout.write('.');
}
console.log('');

if (!serverReady) {
  console.error('Server did not start in time');
  server.kill();
  process.exit(1);
}

const BASE = 'http://localhost:3111';

const routes = [
  { name: '01-homepage', path: '/' },
  { name: '02-dashboard', path: '/dashboard' },
  { name: '03-assistant', path: '/assistant' },
  { name: '04-agents', path: '/agents' },
  { name: '05-generations', path: '/generations' },
  { name: '06-tasks', path: '/tasks' },
  { name: '07-lifelog', path: '/lifelog' },
  { name: '08-notes', path: '/notes' },
  { name: '09-goals', path: '/goals' },
  { name: '10-knowledge', path: '/knowledge' },
  { name: '11-studio-hub', path: '/tools' },
  { name: '12-music-studio', path: '/tools/music' },
  { name: '13-creative-studio', path: '/tools/creative' },
  { name: '14-trip-planner', path: '/tools/travel' },
  { name: '15-health-engine', path: '/tools/health' },
  { name: '16-study-coach', path: '/tools/study' },
  { name: '17-journal', path: '/tools/journal' },
  { name: '18-budget-planner', path: '/tools/budget' },
  { name: '19-how-to-guide', path: '/tools/how-to' },
  { name: '20-social-media', path: '/tools/social-media' },
  { name: '21-video-studio', path: '/tools/video' },
  { name: '22-video-avatar', path: '/tools/avatar' },
  { name: '23-landing-page', path: '/tools/landing' },
  { name: '24-html-mailer', path: '/tools/mailer' },
  { name: '25-pitch-deck', path: '/tools/pitch' },
  { name: '26-ad-copy', path: '/tools/adcopy' },
  { name: '27-seo-blog', path: '/tools/blog' },
  { name: '28-content-calendar', path: '/tools/social' },
  { name: '29-cold-outreach', path: '/tools/outreach' },
  { name: '30-naming-tagline', path: '/tools/naming' },
  { name: '31-campaign-planner', path: '/tools/campaign' },
  { name: '32-lifecycle-os', path: '/tools/lifecycle' },
  { name: '33-meeting-studio', path: '/tools/meeting' },
  { name: '34-report-studio', path: '/tools/report' },
  { name: '35-sop-studio', path: '/tools/sop' },
  { name: '36-job-description', path: '/tools/jd' },
  { name: '37-prd-spec', path: '/tools/prd' },
  { name: '38-okr-planner', path: '/tools/okr' },
  { name: '39-proposal-sow', path: '/tools/proposal' },
  { name: '40-skills', path: '/skills' },
  { name: '41-job-agent', path: '/job-agent' },
  { name: '42-kolab', path: '/kolab' },
  { name: '43-apps', path: '/apps' },
  { name: '44-finance', path: '/finance' },
  { name: '45-plans', path: '/plans' },
  { name: '46-capabilities', path: '/capabilities' },
  { name: '47-agent-activity', path: '/activity' },
  { name: '48-app-audit', path: '/audit' },
  { name: '49-settings', path: '/settings' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  let success = 0, fail = 0;
  console.log(`Capturing ${routes.length} desktop screenshots...`);

  for (const route of routes) {
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${route.name}.png`, fullPage: false });
      console.log(`✅ ${route.name}`);
      success++;
    } catch (e) {
      console.log(`⚠️  ${route.name} — ${e.message.slice(0, 100)}`);
      fail++;
    } finally {
      await page.close();
    }
  }

  // Mobile screenshots
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobileRoutes = [
    { name: '50-mobile-home', path: '/' },
    { name: '51-mobile-assistant', path: '/assistant' },
    { name: '52-mobile-studio', path: '/tools' },
  ];

  for (const route of mobileRoutes) {
    const page = await mobile.newPage();
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${route.name}.png`, fullPage: false });
      console.log(`✅ ${route.name}`);
      success++;
    } catch (e) {
      console.log(`⚠️  ${route.name} — ${e.message.slice(0, 100)}`);
      fail++;
    } finally {
      await page.close();
    }
  }

  // Mobile hamburger open
  const hamburgerPage = await mobile.newPage();
  try {
    await hamburgerPage.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
    await hamburgerPage.waitForTimeout(800);
    const btn = await hamburgerPage.$('button.lg\\:hidden');
    if (btn) { await btn.click(); await hamburgerPage.waitForTimeout(600); }
    await hamburgerPage.screenshot({ path: `${OUT}/53-mobile-hamburger-open.png`, fullPage: false });
    console.log('✅ 53-mobile-hamburger-open');
    success++;
  } catch (e) {
    console.log(`⚠️  53-mobile-hamburger-open — ${e.message.slice(0, 100)}`);
    fail++;
  } finally {
    await hamburgerPage.close();
  }

  await browser.close();
  console.log(`\nDone! ${success} captured, ${fail} failed. Screenshots in docs/screenshots/`);

  // Kill the server
  server.kill();
  process.exit(0);
})();
})();
