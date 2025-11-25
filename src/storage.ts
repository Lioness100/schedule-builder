import { CookieJar } from 'tough-cookie';
import { env } from './config';

export async function loadCookies() {
	const file = Bun.file(env.COOKIE_PATH);

	try {
		const data = await file.json();
		return await CookieJar.deserialize(data);
	} catch {
		return null;
	}
}

export async function saveCookies(jar: CookieJar) {
	const serialized = await jar.serialize();
	const data = JSON.stringify(serialized, null, 2);
	await Bun.write(env.COOKIE_PATH, data);
}
