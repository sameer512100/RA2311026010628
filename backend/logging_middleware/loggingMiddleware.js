const LOG_URL = process.env.TEST_SERVER_URL;
const LOG_TOKEN = process.env.LOG_API_TOKEN || process.env.NOTIF_API_TOKEN || '';

const ALLOWED_STACKS = new Set(['backend', 'frontend']);
const ALLOWED_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const BACKEND_PACKAGES = new Set(['cache', 'controller', 'cron_job', 'db', 'domain', 'handler', 'repository', 'route', 'service']);
const FRONTEND_PACKAGES = new Set(['api', 'component', 'hook', 'page']);

function normalize(value) {
	return String(value || '').trim().toLowerCase();
}

function validate(stack, level, packageName, message) {
	if (!LOG_URL) {
		throw new Error('TEST_SERVER_URL is not configured');
	}

	if (!ALLOWED_STACKS.has(stack)) {
		throw new Error(`Invalid stack: ${stack}`);
	}

	if (!ALLOWED_LEVELS.has(level)) {
		throw new Error(`Invalid level: ${level}`);
	}

	const allowedPackages = stack === 'backend' ? BACKEND_PACKAGES : FRONTEND_PACKAGES;
	if (!allowedPackages.has(packageName)) {
		throw new Error(`Invalid package for ${stack}: ${packageName}`);
	}

	if (!String(message || '').trim()) {
		throw new Error('Message is required');
	}
}

async function Log(stack, level, packageName, message) {
	const normalizedStack = normalize(stack);
	const normalizedLevel = normalize(level);
	const normalizedPackage = normalize(packageName);

	validate(normalizedStack, normalizedLevel, normalizedPackage, message);

	const logEntry = {
		stack: normalizedStack,
		level: normalizedLevel,
		package: normalizedPackage,
		message: String(message),
	};

	const headers = {
		"Content-Type": "application/json",
	};

	if (LOG_TOKEN) {
		headers.Authorization = `Bearer ${LOG_TOKEN}`;
	}

	const response = await fetch(LOG_URL, {
		method: "POST",
		headers,
		body: JSON.stringify(logEntry),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`Logging request failed with status ${response.status}${body ? `: ${body}` : ''}`);
	}

	return response.json().catch(() => null);
}

module.exports = Log;
