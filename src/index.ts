/* eslint-disable @typescript-eslint/naming-convention */
import type { CookieJar } from 'tough-cookie';
import { authenticate, getCookieString, getXsrfToken, verifyCookies, SCHEDULE_BUILDER_URL } from './auth';
import { loadCookies } from './storage';
import { env } from './config';

let cookieJar = await loadCookies();
let refreshPromise: Promise<CookieJar> | null = null;

async function refreshCookies() {
	if (refreshPromise) {
		return refreshPromise;
	}

	refreshPromise = authenticate();
	cookieJar = await refreshPromise;

	// eslint-disable-next-line require-atomic-updates
	refreshPromise = null;
}

if (!cookieJar || !(await verifyCookies(cookieJar))) {
	await refreshCookies();
}

const server = Bun.serve({
	port: env.PORT,
	routes: {
		'/': Bun.file('public/index.html'),
		'/health': async () => {
			const healthy = !refreshPromise && (await verifyCookies(cookieJar!));
			return Response.json({ healthy }, { status: healthy ? 200 : 503 });
		},
		'/api/*': async (req) => {
			const url = new URL(req.url);

			if (url.pathname !== '/api/terms' && env.API_KEY) {
				const authHeader = req.headers.get('Authorization');
				const apiKey = authHeader?.replace('Bearer ', '');

				if (apiKey !== env.API_KEY) {
					return Response.json(
						{ error: 'Unauthorized', message: 'Valid API key required' },
						{ status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
					);
				}
			}

			await refreshPromise;
			const cookie = await getCookieString(cookieJar!);
			const xsrfToken = await getXsrfToken(cookieJar!);

			console.log(`[→] ${req.method} ${url.pathname}`);
			const targetUrl = `${SCHEDULE_BUILDER_URL}${url.pathname}${url.search}`;
			const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;

			const makeRequest = () =>
				fetch(targetUrl, {
					method: req.method,
					body,
					redirect: 'manual',
					headers: {
						cookie,
						'Content-Type': 'application/json',
						'X-Requested-With': 'XMLHttpRequest',
						'X-XSRF-TOKEN': xsrfToken
					}
				});

			let response = await makeRequest();
			if (response.status >= 300 && response.status <= 403) {
				console.log(`[🔄] Authentication failed (status ${response.status}), triggering refresh…`);
				await refreshCookies();
				response = await makeRequest();
				if (response.status >= 300 && response.status <= 403) {
					throw new Error(`Authentication required: ${response.status} ${response.statusText}`);
				}
			}

			return Response.json(await response.json());
		}
	},
	error(error) {
		console.error('[❌] Server error:', error);
		return new Response(`Internal Server Error: ${error}`, { status: 500 });
	}
});

console.log(`[🚀] Server listening on ${server.url}`);

async function keepaliveCheck() {
	const isValid = await verifyCookies(cookieJar!);
	if (!isValid) {
		console.log('[⚠️] Keepalive check failed, triggering refresh…');
		await refreshCookies();
	}
}

setInterval(() => {
	void keepaliveCheck();
}, env.KEEPALIVE_INTERVAL);
