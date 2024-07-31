const axios = require("axios");
const WebSocket = require("ws");
const path = require("path");

const mockBugsnagNotify = jest.fn();
jest.mock("@bugsnag/js", () => ({
	start: jest.fn(() => ({
		notify: mockBugsnagNotify,
	})),
	getPlugin: jest.fn(() => ({
		requestHandler: jest.fn((req, res, next) => next()),
		errorHandler: jest.fn((err, req, res, next) => {
			res.status(500).send("Internal Server Error");
		}),
	})),
}));

jest.mock("@bugsnag/plugin-express", () => jest.fn());

describe("WebSocket Server", () => {
	let serverModule;
	let server;
	let originalEnv;
	let port;
	let api;

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
			TO_CLIENT_TYPE: "client_message",
			FROM_SERVER_TYPE: "server_message",
			LOG_TO_FILE: "false",
		};
		serverModule = require("../server");
		server = await serverModule.startServer(0);
		port = server.address().port;
		api = axios.create({
			baseURL: `http://localhost:${port}`,
		});
	});

	afterEach(async () => {
		if (server && server.close) {
			await new Promise((resolve) => server.close(resolve));
		}
		jest.resetModules();
	}, 10000);

	const connectWebSocket = (path = "") => {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(`ws://localhost:${port}${path}`);
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
		const testUuid = "123e4567-e89b-12d3-a456-426614174000";
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
		const response1 = await api.get("/api/clients", {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(response1.status).toBe(200);

		await expect(api.get("/api/clients")).rejects.toThrow();
		await expect(
			api.get("/api/clients", {
				headers: { Authorization: "Bearer wrong-token" },
			})
		).rejects.toThrow();
	});

	test("Error handling middleware works", async () => {
		serverModule.app.get("/error", (req, res, next) => {
			const error = new Error("Test error");
			error.status = 500;
			next(error);
		});

		try {
			await api.get("/error");
		} catch (error) {
			expect(error.response.status).toBe(500);
			expect(error.response.data).toBe("Internal Server Error");
		}
	});

	test("Unhandled routes return 500 Internal Server Error", async () => {
		try {
			await api.get("/non-existent-route");
		} catch (error) {
			expect(error.response.status).toBe(500);
			expect(error.response.data).toBe("Internal Server Error");
		}
	});

	test("Root route returns expected message", async () => {
		const response = await api.get("/");
		expect(response.status).toBe(200);
		expect(response.data).toBe("WebSocket server is running");
	});

	test("Dashboard route serves login.html", async () => {
		const response = await api.get("/dashboard");
		expect(response.status).toBe(200);
		expect(response.headers["content-type"]).toContain("text/html");
	});

	test("DashboardPage route serves dashboard.html when authenticated", async () => {
		const response = await api.get("/dashboardPage", {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(response.status).toBe(200);
		expect(response.headers["content-type"]).toContain("text/html");
	});

	test("WebSocket message routing works correctly", async () => {
		const testUuid = "123e4567-e89b-12d3-a456-426614174000";
		const ws1 = await connectWebSocket(`/uuid/${testUuid}`);
		const ws2 = await connectWebSocket(`/uuid/${testUuid}`);

		// Add message received flags
		let ws1ReceivedMessage = false;
		let ws2ReceivedMessage = false;

		ws1.on("message", (message) => {
			ws1ReceivedMessage = true;
		});

		ws2.on("message", (message) => {
			ws2ReceivedMessage = true;
		});

		const sentMessage = {
			type: process.env.FROM_SERVER_TYPE,
			message: "Test message",
			uuid: testUuid,
		};

		ws1.send(JSON.stringify(sentMessage));

		// Wait for a short time to allow message processing
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Check if messages were received
		expect(ws2ReceivedMessage).toBe(true);
		expect(ws1ReceivedMessage).toBe(false); // ws1 shouldn't receive its own message

		await closeWebSocket(ws1);
		await closeWebSocket(ws2);
	});

	test("Dashboard WebSocket connection receives updates", async () => {
		const dashboardWs = await connectWebSocket();
		const clientWs = await connectWebSocket();

		const updatePromise = new Promise((resolve) => {
			dashboardWs.on("message", (message) => {
				resolve(JSON.parse(message));
			});
		});

		dashboardWs.send(JSON.stringify({ type: "identify_dashboard" }));

		await closeWebSocket(clientWs);

		const update = await updatePromise;
		expect(update.type).toBe("dashboard_update");
		expect(update).toHaveProperty("count");
		expect(update).toHaveProperty("clients");

		await closeWebSocket(dashboardWs);
	});

	test("generateRandomString returns a string starting with 'anon-'", () => {
		const randomString = serverModule.generateRandomString();
		expect(randomString).toMatch(/^anon-[a-f0-9]{20}$/);
	});

	test("Graceful shutdown works correctly", async () => {
		const ws = await connectWebSocket();

		const shutdownPromise = serverModule.stopServer();

		await expect(shutdownPromise).resolves.toBeUndefined();

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(ws.readyState).toBe(WebSocket.CLOSED);
	});

	test("Dashboard route serves login.html", async () => {
		const response = await api.get("/dashboard");
		expect(response.status).toBe(200);
		expect(response.headers["content-type"]).toContain("text/html");
		expect(response.data).toContain("Login to Dashboard"); // Check for content specific to login.html
	});

	test("DashboardPage route serves dashboard.html when authenticated", async () => {
		const response = await api.get("/dashboardPage", {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(response.status).toBe(200);
		expect(response.headers["content-type"]).toContain("text/html");
		expect(response.data).toContain("BC Socket Dashboard"); // Check for content specific to dashboard.html
	});

	test("DashboardPage route returns 401 when not authenticated", async () => {
		try {
			await api.get("/dashboardPage");
		} catch (error) {
			expect(error.response.status).toBe(401);
		}
	});
});
