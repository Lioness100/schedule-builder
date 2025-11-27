import { setTimeout } from 'node:timers/promises';
import puppeteer, { KnownDevices } from 'puppeteer';
import { CookieJar, Cookie } from 'tough-cookie';
import { env } from './config';
import { saveCookies } from './storage';

export const SCHEDULE_BUILDER_URL = 'https://umass.collegescheduler.com';
const SPIRE_ENTRY_URL =
	'https://www.spire.umass.edu/psc/heproda_20/EMPLOYEE/SA/c/SSR_STUDENT_FL.SSR_MD_SP_FL.GBL?Action=U&MD=Y&GMenu=SSR_STUDENT_FL&GComp=SSR_START_PAGE_FL&GPage=SSR_START_PAGE_FL&scname=CS_SSR_MANAGE_CLASSES_NAV&AJAXTransfer=y';

const SUBMIT_BUTTON = 'input[type="submit"]';

export async function authenticate() {
	console.log('[🚀] Starting authentication…');

	const browser = await puppeteer.launch({
		userDataDir: env.BROWSER_DATA_DIR,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	try {
		const page = await browser.newPage();
		await page.emulate(KnownDevices['iPad Pro landscape']);

		// If the browser navigates to Schedule Builder with expired cookies, it
		// will redirect to /logged-out and close the tab.
		const existingCookies = await page.cookies(SCHEDULE_BUILDER_URL);
		if (existingCookies.length > 0) {
			await page.deleteCookie(...existingCookies);
			console.log(`[🧹] Cleared ${existingCookies.length} stale cookie(s)`);
		}

		console.log('[💬] Navigating to SPIRE portal…');
		await page.goto(SPIRE_ENTRY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

		if (page.url().includes('login.microsoftonline.com')) {
			console.log('[🔐] Logging in with Microsoft OAuth…');
			await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
			await page.type('input[type="email"]', env.UMASS_EMAIL);

			await setTimeout(500);
			await page.click(SUBMIT_BUTTON);

			await page.waitForSelector('input[type="password"]:not(.moveOffScreen)', { timeout: 15_000 });
			await page.type('input[type="password"]', env.UMASS_PASSWORD);

			await setTimeout(500);
			await page.click(SUBMIT_BUTTON);

			try {
				await page.waitForSelector('input[name="otc"]', { timeout: 2000 });
				console.write('[🔑] 2FA required! Please enter your code: ');

				const { value: otc } = await console[Symbol.asyncIterator]().next();
				await page.type('input[name="otc"]', otc);
				await page.click('input[name="rememberMFA"]');
				await page.click(SUBMIT_BUTTON);
			} catch {
				// No 2FA required
			}

			try {
				await page.waitForSelector('input[name="DontShowAgain"]', { timeout: 2000 });
				await page.click(SUBMIT_BUTTON);
			} catch {
				// No "Stay signed in" prompt
			}

			console.log('[✅] Logged in! Waiting for SPIRE to load…');
			await page.waitForNavigation({ timeout: 30_000 });
		} else {
			console.log('[✅] Already authenticated, skipping login…');
		}

		await page.waitForNetworkIdle();

		console.log('[🖱️] Navigating to schedule builder…');
		await page.waitForSelector('#SCC_LO_FL_WRK_SCC_VIEW_BTN\\$2', { timeout: 15_000 });
		await page.click('#SCC_LO_FL_WRK_SCC_VIEW_BTN\\$2');
		await page.waitForSelector('#SCC_LO_FL_WRK_SCC_VIEW_BTN\\$24\\$\\$10', { timeout: 15_000 });

		const newPagePromise = browser.waitForTarget((target) => target.url().includes(SCHEDULE_BUILDER_URL), {
			timeout: 30_000
		});

		await page.click('#SCC_LO_FL_WRK_SCC_VIEW_BTN\\$24\\$\\$10');
		console.log('[⏳] Waiting for schedule builder to open…');

		const target = await newPagePromise;
		const schedulerPage = await target.page();

		if (!schedulerPage) {
			throw new Error('Failed to open schedule builder page');
		}

		console.log('[📝] Extracting cookies and XSRF token…');
		const cookieJar = new CookieJar();

		// It seems the XSRF token is necessary for POST requests.
		await schedulerPage.waitForSelector('input[name="__RequestVerificationToken"]', { timeout: 15_000 });
		const xsrfToken = await schedulerPage.$eval('input[name="__RequestVerificationToken"]', (el) => el.value);

		const xsrfCookie = new Cookie({
			key: 'X-XSRF-TOKEN-VALUE',
			value: xsrfToken,
			domain: 'umass.collegescheduler.com',
			path: '/',
			httpOnly: false,
			secure: true
		});

		await cookieJar.setCookie(xsrfCookie, SCHEDULE_BUILDER_URL);
		await schedulerPage.waitForSelector('#Term-options', { timeout: 15_000 });
		const cookies = await schedulerPage.cookies();

		for (const cookie of cookies) {
			const toughCookie = new Cookie({
				key: cookie.name,
				value: cookie.value,
				domain: cookie.domain,
				path: cookie.path,
				expires: cookie.expires && cookie.expires !== -1 ? new Date(cookie.expires * 1000) : undefined,
				httpOnly: cookie.httpOnly,
				secure: cookie.secure,
				sameSite: cookie.sameSite?.toLowerCase()
			});

			const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
			await cookieJar.setCookie(toughCookie, url);
		}

		await saveCookies(cookieJar);
		console.log('[✅] Cookie extraction complete');

		return cookieJar;
	} finally {
		await browser.close();
	}
}

export function getCookieString(jar: CookieJar) {
	return jar.getCookieString(SCHEDULE_BUILDER_URL);
}

export async function getXsrfToken(jar: CookieJar) {
	const cookies = await jar.getCookies(SCHEDULE_BUILDER_URL);
	const xsrfCookie = cookies.find((c) => c.key === 'X-XSRF-TOKEN-VALUE')!;
	return xsrfCookie.value;
}

export async function getCookieAge(jar: CookieJar) {
	const cookies = await jar.getCookies(SCHEDULE_BUILDER_URL);
	const creation = cookies[0].creation as Date;
	return Date.now() - creation.getTime();
}

export async function verifyCookies(jar: CookieJar) {
	const response = await fetch(SCHEDULE_BUILDER_URL, {
		headers: { cookie: await getCookieString(jar) },
		redirect: 'manual'
	}).catch(() => null);

	return response?.status === 200;
}

if (import.meta.main) {
	console.log('[🚀] Extracting cookies from SPIRE Schedule Builder');
	await authenticate();
}
