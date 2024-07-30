# 🚀 Boi's Club Socket Server

> A robust WebSocket server for Vercel users and beyond!

[![Node.js CI](https://github.com/bryanthaboi/boisclubsocketserver/actions/workflows/node.js.yml/badge.svg)](https://github.com/bryanthaboi/boisclubsocketserver/actions/workflows/node.js.yml)

[![Vercel](https://img.shields.io/badge/vercel-%23000000.svg?style=flat&logo=vercel&logoColor=white)](https://vercel.com/)
[![Heroku](https://img.shields.io/badge/heroku-%23430098.svg?style=flat&logo=heroku&logoColor=white)](https://www.heroku.com/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D7.0.0-orange.svg)](https://pnpm.io/)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
![Express](https://img.shields.io/badge/express-%5E4.19.2-brightgreen)
![UUID](https://img.shields.io/badge/uuid-%5E10.0.0-brightgreen)
![Winston](https://img.shields.io/badge/winston-%5E3.13.1-brightgreen)
![WebSocket](https://img.shields.io/badge/ws-%5E8.18.0-brightgreen)
![Bugsnag JS](https://img.shields.io/badge/@bugsnag/js-%5E7.25.0-brightgreen)
![Bugsnag Plugin Express](https://img.shields.io/badge/@bugsnag/plugin--express-%5E7.25.0-brightgreen)
![Winston Bugsnag](https://img.shields.io/badge/winston--bugsnag-%5E3.0.2-brightgreen)
![Jest](https://img.shields.io/badge/jest-%5E29.7.0-brightgreen)
![Axios](https://img.shields.io/badge/axios-%5E1.7.2-brightgreen)

## 🌟 Why Boi's Club Socket Server?

Vercel doesn't support WebSockets, but that shouldn't stop you from adding real-time functionality to your applications! This WebSocket server is designed to be deployed on platforms that support WebSockets (like Heroku), complementing your Vercel deployments and bringing the power of real-time communication to your projects.

## ✨ Features

- 🔌 Robust WebSocket server using Node.js and Express
- 🐞 Optional Bugsnag integration for error tracking
- 📝 Winston logger for comprehensive logging
- 🔒 Simple authentication middleware for specific routes
- 🎛 Customizable message handling with predefined message types
- 🆔 UUID-based or anonymous client identification
- 📊 Client connection tracking

## 📋 Prerequisites

- Node.js (v14 or later recommended)
- pnpm (v7 or later recommended)
- A Heroku account (or any other platform that supports WebSockets)
- (Optional) A Bugsnag account for error tracking

## 🚀 Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/boisclubsocketserver.git
   cd boisclubsocketserver
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up your environment:

   ```bash
   cp .env.example .env
   ```

4. Modify the `.env` file with your specific values.

5. Start the server:
   ```bash
   pnpm start
   ```

## 🔧 Configuration

### Environment Variables

- `PORT`: The port on which the server will run (default: 3000)
- `AUTH_TOKEN`: A secret token for authenticating certain routes
- `BUGSNAG_API_KEY`: (Optional) Your Bugsnag API key for error tracking
- `LOG_TO_FILE`: Set to "true" to enable file logging
- `TO_CLIENT_TYPE`: Message type for messages sent to clients
- `FROM_SERVER_TYPE`: Message type for messages sent from the server

## 🔒 Authentication

The server includes a simple authentication middleware for specific routes. To use a protected route, include the `AUTH_TOKEN` in the Authorization header:

```
Authorization: Bearer YOUR_AUTH_TOKEN
```

To disable authentication for a route, simply remove the `authenticate` middleware from the route definition.

## 🆔 Client Identification

Clients can connect with or without a UUID:

- With UUID: Connect to `/uuid/{your-uuid}`
- Without UUID: Connect to the root path, and an anonymous ID will be generated

To disable UUID-based identification, modify the connection handler in `server.js`:

```javascript
wss.on("connection", (ws, req) => {
	const clientId = generateRandomString();
	// ... rest of the handler
});
```

## 🐞 Bugsnag Integration (Optional)

1. Sign up for a [Bugsnag account](https://www.bugsnag.com/).
2. Create a new project in Bugsnag to get your API key.
3. Set the `BUGSNAG_API_KEY` environment variable.

To disable Bugsnag, remove or comment out the Bugsnag-related code in `server.js`.

## 🛠 Customizing WebSocket Handlers

Modify the WebSocket connection handler in `server.js`:

```javascript
wss.on("connection", (ws, req) => {
	// ... existing code ...

	ws.on("message", (message) => {
		const messageString = message.toString();
		const freshMessage = JSON.parse(messageString);

		// Customize message handling here
		if (freshMessage.type === socketMessageTypes.SERVER) {
			// Handle server messages
		} else if (freshMessage.type === socketMessageTypes.CLIENT) {
			// Handle client messages
		}
		// ... additional message handling logic
	});

	// ... existing code ...
});
```

## 📦 Deployment

### Heroku Deployment

1. Create a new Heroku app:

   ```bash
   heroku create your-app-name
   ```

2. Set environment variables:

   ```bash
   heroku config:set AUTH_TOKEN=your_secret_token
   heroku config:set BUGSNAG_API_KEY=your_bugsnag_api_key  # Optional
   heroku config:set TO_CLIENT_TYPE=your_client_message_type
   heroku config:set FROM_SERVER_TYPE=your_server_message_type
   heroku config:set LOG_TO_FILE=false  # Set to true if you want file logging
   ```

3. Deploy:

   ```bash
   git push heroku main
   ```

4. Ensure at least one dyno is running:
   ```bash
   heroku ps:scale web=1
   ```

## 🔗 Usage with Vercel Deployments

In your Vercel-deployed frontend:

```javascript
const socket = new WebSocket("wss://your-heroku-app-name.herokuapp.com");
// Or with UUID: new WebSocket("wss://your-heroku-app-name.herokuapp.com/uuid/your-uuid");

socket.onopen = () => {
	console.log("Connected to WebSocket server");
	socket.send(
		JSON.stringify({
			type: "FROM_SERVER_TYPE",
			message: "Hello, server!",
			uuid: "client-uuid",
		})
	);
};

socket.onmessage = (event) => {
	const data = JSON.parse(event.data);
	console.log("Received:", data);
};
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://opensource.org/licenses/MIT) file for details.

## 💖 Why pnpm?

We recommend using [pnpm](https://pnpm.io/) for this project. pnpm is faster, more efficient, and uses less disk space compared to npm or Yarn. It creates a non-flat `node_modules` structure, which leads to:

- Saved disk space
- Boosted installation speed
- Better security

To install pnpm, run:

```bash
npm install -g pnpm
```

## 🌐 Keywords

WebSocket, Vercel, Real-time, Node.js, Express, Heroku, Bugsnag, Winston, pnpm, UUID, Authentication

---

Made with ❤️ by BryanThaBoi
