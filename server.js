require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const url = require("url");
const { validate } = require("uuid");
const winston = require("winston");
const crypto = require("crypto");
const path = require("path");
const cors = require("cors");

// Initialize Express app
const app = express();

// Set Socket Message Types
const socketMessageTypes = {
	CLIENT: process.env.TO_CLIENT_TYPE,
	SERVER: process.env.FROM_SERVER_TYPE,
};

// Initialize HTTP server and WebSocket server variables
let server;
let wss;

// Set up Winston transports for optional file logs
let transportsArray = [new winston.transports.Console()];
if (process.env.LOG_TO_FILE === "true") {
	transportsArray.push(
		new winston.transports.File({ filename: "error.log", level: "error" })
	);
	transportsArray.push(
		new winston.transports.File({ filename: "combined.log" })
	);
}

// Set up Winston logger
const loggerConfig = {
	level: "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json()
	),
	transports: transportsArray,
};

const logger = winston.createLogger(loggerConfig);

// Initialize Bugsnag if API key is provided
let Bugsnag;
let middleware;
if (process.env.BUGSNAG_API_KEY) {
	Bugsnag = require("@bugsnag/js");
	const BugsnagPluginExpress = require("@bugsnag/plugin-express");

	Bugsnag.start({
		apiKey: process.env.BUGSNAG_API_KEY,
		plugins: [BugsnagPluginExpress],
	});
	logger.info("Bugsnag started");
	middleware = Bugsnag.getPlugin("express");
	app.use(middleware.requestHandler);
}

// Simple in-memory storage for connected clients
const clients = new Map();

// Simple authentication middleware
const authenticate = (req, res, next) => {
	const authHeader = req.headers.authorization;
	if (authHeader) {
		const token = authHeader.split(" ")[1];
		if (token == process.env.AUTH_TOKEN) {
			next();
		} else {
			res.sendStatus(403);
		}
	} else {
		res.sendStatus(401);
	}
};

// Express routes
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
	res.send("WebSocket server is running");
});

// Login page route
app.get("/dashboard", cors(), (req, res) => {
	res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Apply authentication only to specific routes
app.get("/dashboardPage", authenticate, cors(), (req, res) => {
	res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Clients route for ingest into dashboard
app.get("/api/clients", authenticate, cors(), (req, res) => {
	const clientList = Array.from(clients.values());
	res.json({ count: clients.size, clients: clientList });
});

// Error handling middleware
app.use((err, req, res, next) => {
	logger.error("Unhandled error:", err);
	if (Bugsnag) Bugsnag.notify(new Error("Unhandled error:", err));
	res.status(500).send("Internal Server Error");
});

// Catch-all middleware for unhandled routes
app.use((req, res) => {
	const error = new Error(`Unhandled route: ${req.originalUrl}`);
	error.status = 404;
	logger.error("Unhandled route:", `${req.originalUrl}`);
	if (Bugsnag) {
		Bugsnag.notify(error, {
			severity: "warning",
			context: "unhandled-route",
		});
	}
	res.status(500).send("Internal Server Error");
});

// Generate a random string for anonymous client UUID
const generateRandomString = () => {
	return "anon-" + crypto.randomBytes(10).toString("hex");
};

// Start the server
const startServer = (port) => {
	return new Promise((resolve) => {
		server = http.createServer(app);

		wss = new WebSocket.Server({ server: server });
		const sendDashboardUpdate = () => {
			const clientList = Array.from(clients.values());
			wss.clients.forEach((client) => {
				if (client.isDashboard && client.readyState === WebSocket.OPEN) {
					client.send(
						JSON.stringify({
							type: "dashboard_update",
							count: clients.size,
							clients: clientList,
						})
					);
				}
			});
		};

		// WebSocket connection handler
		wss.on("connection", (ws, req) => {
			try {
				sendDashboardUpdate();
				const pathname = url.parse(req.url).pathname;
				let clientId;

				if (pathname.startsWith("/uuid/")) {
					const possibleUuid = pathname.split("/")[2];
					if (validate(possibleUuid)) {
						clientId = possibleUuid;
					} else {
						clientId = generateRandomString();
					}
				} else {
					clientId = generateRandomString();
				}

				clients.set(ws, clientId);

				logger.info(`Client connected: ${clientId}`);

				ws.on("message", (message) => {
					let freshMessage = JSON.parse(message.toString());
					if (freshMessage.type === "identify_dashboard") {
						ws.isDashboard = true;
					} else {
						wss.clients.forEach((client) => {
							if (client !== ws && client.readyState === WebSocket.OPEN) {
								if (
									freshMessage.type == socketMessageTypes.SERVER &&
									freshMessage.uuid == clientId
								) {
									client.send(
										JSON.stringify({
											type: socketMessageTypes.CLIENT,
											message: freshMessage.message,
											uuid: freshMessage.uuid,
										})
									);
								}
							}
						});
					}
				});

				ws.on("close", () => {
					logger.info(`Client disconnected: ${clientId}`);
					clients.delete(ws);
					sendDashboardUpdate();
				});

				ws.on("error", (error) => {
					logger.error(`WebSocket error for client ${clientId}:`, error);
					if (Bugsnag) Bugsnag.notify(error);
				});
			} catch (error) {
				logger.error("Error in WebSocket connection:", error);
				if (Bugsnag) Bugsnag.notify(error);
			}
		});

		server.listen(port, () => {
			const address = server.address();
			const wsUrl = `ws://${
				address.address === "::" ? "localhost" : address.address
			}:${address.port}`;
			logger.info(`WebSocket URL: ${wsUrl} or ${wsUrl}/uuid/{uuid}`);
			resolve(server);
		});
	});
};

// Graceful shutdown
const stopServer = () => {
	return new Promise((resolve) => {
		if (wss) {
			logger.info("Closing WebSocket connections...");
			wss.clients.forEach((client) => {
				if (client.readyState === WebSocket.OPEN) {
					client.close();
				}
			});
			wss.close(() => {
				logger.info("WebSocket server closed");
				if (server) {
					server.close(() => {
						logger.info("HTTP server closed");
						resolve();
					});
				} else {
					resolve();
				}
			});
		} else if (server) {
			server.close(() => {
				logger.info("HTTP server closed");
				resolve();
			});
		} else {
			resolve();
		}
	});
};

if (Bugsnag) app.use(middleware.errorHandler);

process.on("SIGTERM", async () => {
	logger.info("SIGTERM signal received: closing HTTP server");
	await stopServer();
	process.exit(0);
});

module.exports = { app, startServer, stopServer, generateRandomString };
