/* eslint-disable @typescript-eslint/naming-convention */
import { bool, cleanEnv, email, num, port, str } from 'envalid';

export const env = cleanEnv(process.env, {
	UMASS_EMAIL: email(),
	UMASS_PASSWORD: str(),
	PORT: port({ default: 3007 }),
	KEEPALIVE_INTERVAL: num({ default: 45_000 }),
	COOKIE_PATH: str({ default: '.cache/cookies.json' }),
	BROWSER_DATA_DIR: str({ default: '.browser-data' }),
	API_KEY: str({ default: '' }),
	ENABLED: bool({ default: true })
});
