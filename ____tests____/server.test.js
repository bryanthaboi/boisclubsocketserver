const axios = require("axios");
const WebSocket = require("ws");

describe("WebSocket Server", () => {
	let serverModule;
	let server;
	let originalEnv;
	let port;

	beforeAll(() => {
		originalEnv = process.env;
		process.removeAllListeners("SIGTERM");
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	beforeEach(async () => {
		jest.resetModules();
		process.env = {
			...originalEnv,
			AUTH_TOKEN: "test-token",
			PORT: "0",
			BUGSNAG_API_KEY: "test-bugsnag-key",
		};
		serverModule = require("../server");
		server = await serverModule.startServer(0);
		port = server.address().port;
	});

	afterEach(async () => {
		if (server && server.close) {
			await new Promise((resolve) => server.close(resolve));
		}
		jest.resetModules();
	});

	const api = axios.create({
		baseURL: `http://localhost:${port}`,
	});

	const connectWebSocket = (path = "") => {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
			ws.on("open", () => resolve(ws));
			ws.on("error", reject);
		});
	};

	const closeWebSocket = (ws) => {
		return new Promise((resolve) => {
			ws.on("close", resolve);
			ws.close();
		});
	};

	test("WebSocket connection with UUID is established", async () => {
		const testUuid = "mock-uuid";
		const ws = await connectWebSocket(`/uuid/${testUuid}`);
		expect(ws.readyState).toBe(WebSocket.OPEN);
		await closeWebSocket(ws);
	});

	test("WebSocket connection without UUID is established", async () => {
		const ws = await connectWebSocket();
		expect(ws.readyState).toBe(WebSocket.OPEN);
		await closeWebSocket(ws);
	});

	test("Authentication middleware works correctly", async () => {
		delete process.env.BUGSNAG_API_KEY;
		jest.resetModules();

		// Perform requests
		const response1 = await api.get(`http://localhost:${port}/clients`, {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(response1.status).toBe(200);

		try {
			await api.get(`http://localhost:${port}/clients`);
		} catch (error) {
			expect(error.response.status).toBe(401);
		}

		try {
			await api.get(`http://localhost:${port}/clients`, {
				headers: { Authorization: "Bearer wrong-token" },
			});
		} catch (error) {
			expect(error.response.status).toBe(403);
		}
	});

	test("Error handling middleware works", async () => {
		serverModule.app.get(`http://localhost:${port}/error`, (req, res, next) => {
			const error = new Error("Test error");
			error.status = 500;
			next(error);
		});

		try {
			await api.get(`http://localhost:${port}/error`);
		} catch (error) {
			expect(error.response.status).toBe(500);
			expect(error.response.data).toBe("Internal Server Error");
		}
	});

	test("Unhandled routes return 500 Internal Server Error", async () => {
		delete process.env.BUGSNAG_API_KEY;
		jest.resetModules();

		try {
			await api.get(`http://localhost:${port}/non-existent-route`);
		} catch (error) {
			console.log(error);
			expect(error.response.status).toBe(500);
			expect(error.response.data).toBe("Internal Server Error");
		}
	});
});
