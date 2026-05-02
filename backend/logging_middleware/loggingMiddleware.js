const testUrl = process.env.TEST_SERVER_URL;

async function log(stack, level, packageName, message) {
	const logEntry = {
		stack,
		level,
		package: packageName,
		message,
	};

	const response = await fetch(testUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(logEntry),
	});

	if (!response.ok) {
		throw new Error(`Logging request failed with status ${response.status}`);
	}

	return response.json().catch(() => null);
}

module.exports = log;
