require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const url = require("url");
const { validate } = require("uuid");
const winston = require("winston");
const crypto = require("crypto");

// Initialize Express app
const app = express();

// Set Socket Message Types
const socketMessageTypes = {
	CLIENT: process.env.TO_CLIENT_TYPE,
	SERVER: process.env.FROM_SERVER_TYPE,
};

let server;
let wss;
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
	console.log("Bugsnag started");
	// Use Bugsnag's Express middleware
	middleware = Bugsnag.getPlugin("express");
	app.use(middleware.requestHandler);
}

const logger = winston.createLogger(loggerConfig);

// Simple in-memory storage for connected clients
const clients = new Map();

// Simple authentication middleware
const authenticate = (req, res, next) => {
	const authHeader = req.headers.authorization;
	if (authHeader) {
		const token = authHeader.split(" ")[1];
		if (token === process.env.AUTH_TOKEN) {
			next();
		} else {
			res.sendStatus(403);
		}
	} else {
		res.sendStatus(401);
	}
};

// Express routes
app.get("/", (req, res) => {
	res.send("WebSocket server is running");
});

app.get("/clients", authenticate, (req, res) => {
	res.json({ connectedClients: clients.size });
});

// Error handling middleware
app.use((err, req, res, next) => {
	logger.error("Unhandled error:", err);
	if (Bugsnag) Bugsnag.notify(new Error("Unhandled error:", err));
	res.status(500).send("Internal Server Error");
});

// Catch-all middleware for unhandled routes
app.use((req, res) => {
	const error = new Error(`Not Found - ${req.originalUrl}`);
	error.status = 404;
	logger.error("Unhandled route:", error.message);
	if (Bugsnag) {
		Bugsnag.notify(error, {
			severity: "warning",
			context: "unhandled-route",
		});
	}
	res.status(500).send("Internal Server Error");
});

// Start the server
const generateRandomString = () => {
	return "anon-" + crypto.randomBytes(10).toString("hex");
};

const startServer = (port) => {
	return new Promise((resolve) => {
		server = http.createServer(app);

		wss = new WebSocket.Server({ server: server });

		// WebSocket connection handler
		wss.on("connection", (ws, req) => {
			try {
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
				console.log(`Client connected: ${clientId}`);

				ws.on("message", (message) => {
					const messageString = message.toString();

					wss.clients.forEach((client) => {
						if (client !== ws && client.readyState === WebSocket.OPEN) {
							let freshMessage = JSON.parse(messageString);

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
				});

				ws.on("close", () => {
					logger.info(`Client disconnected: ${clientId}`);
					console.log(`Client disconnected: ${clientId}`);
					clients.delete(ws);
				});

				ws.on("error", (error) => {
					logger.error(`WebSocket error for client ${clientId}:`, error);
					console.error(`WebSocket error for client ${clientId}:`, error);
					if (Bugsnag) Bugsnag.notify(error);
				});
			} catch (error) {
				logger.error("Error in WebSocket connection:", error);
				console.error("Error in WebSocket connection:", error);
				if (Bugsnag) Bugsnag.notify(error);
			}
		});

		server.listen(port, () => {
			const address = server.address();
			const wsUrl = `ws://${
				address.address === "::" ? "localhost" : address.address
			}:${address.port}`;
			console.log(`Server running on port ${address.port}`);
			console.log(`WebSocket URL: ${wsUrl} or ${wsUrl}/uuid/{uuid}`);
			logger.info(`Server started`, { port: address.port, wsUrl: wsUrl });
			resolve(server);
		});
	});
};

// Graceful shutdown
const stopServer = () => {
	return new Promise((resolve) => {
		if (wss) {
			console.log("Closing WebSocket connections...");
			wss.clients.forEach((client) => {
				if (client.readyState === WebSocket.OPEN) {
					client.close();
				}
			});
			wss.close(() => {
				console.log("WebSocket server closed");
				if (server) {
					server.close(() => {
						console.log("HTTP server closed");
						resolve();
					});
				} else {
					resolve();
				}
			});
		} else if (server) {
			server.close(() => {
				console.log("HTTP server closed");
				resolve();
			});
		} else {
			resolve();
		}
	});
};

if (Bugsnag) app.use(middleware.errorHandler);

process.on("SIGTERM", async () => {
	console.log(`Server turning off.`);
	logger.info("SIGTERM signal received: closing HTTP server");
	await stopServer();
	process.exit(0);
});

module.exports = { app, startServer, stopServer, generateRandomString };
