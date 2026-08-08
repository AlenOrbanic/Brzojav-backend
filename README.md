# Brzojav Backend

This repository contains the backend server for Brzojav, a real-time web messaging application.

The backend provides the REST API, authentication, database access, file uploads, real-time notifications and WebRTC signaling.

## Frontend

The frontend repository is available here:

[Brzojav](https://github.com/AlenOrbanic/Brzojav)

## Technologies

- **Node.js** – JavaScript runtime
- **Express** – HTTP server and REST API
- **MongoDB** – database
- **Mongoose** – MongoDB object modeling
- **Socket.IO** – real-time communication and WebRTC signaling
- **JWT** – authentication
- **bcryptjs** – password hashing
- **Google Auth Library** – Google authentication
- **Cloudinary** – multimedia file storage
- **Multer** – multipart file handling
- **streamifier** – converting uploaded buffers into streams
- **Helmet** – HTTP security headers
- **CORS** – cross-origin resource sharing
- **express-rate-limit** – rate limiting
- **node-fetch** – HTTP requests between backend nodes and external services

These dependencies are defined in the backend's `package.json`.

## Features

- User registration and login
- Google authentication
- JWT authentication
- User profile management
- Password changes
- User blocking
- Account deletion
- One-to-one chats
- Group chats
- Message storage
- Message deletion
- Message reactions
- Pinned messages
- File uploads
- Image and video uploads
- Link previews
- Real-time notifications
- WebRTC signaling
- Online-user tracking
- Peer lookup
- Multiple backend nodes
- Gossip-based synchronization between nodes
- Automatic removal of inactive peer records
- Security headers
- Request rate limiting
- NoSQL injection protection

## Project Structure

```text
Brzojav-backend/
├── middleware/
│   ├── auth.js             # JWT authentication middleware
│   └── upload.js           # File upload handling
│
├── models/
│   ├── Chat.js             # Chat model
│   ├── Message.js          # Message model
│   ├── User.js             # User model
│   └── UserChat.js         # User-chat relationship
│
├── routes/
│   ├── auth.js             # Authentication and account management
│   ├── chats.js            # Chat and group management
│   ├── links.js            # Link preview handling
│   ├── lookup.js           # Peer/user lookup
│   ├── messages.js         # Message operations
│   ├── sync.js             # Inter-node synchronization
│   └── users.js            # Online-user registration
│
├── cloudinary.js            # Cloudinary configuration
├── db.js                    # MongoDB connection
├── gossip.js                # Gossip synchronization
├── index.js                 # Server entry point
├── peers.js                 # Seed-node configuration
├── registry.js              # In-memory user registry
├── package.json
└── README.md
```

The current repository contains separate modules for the database, peer registry, gossip synchronization, WebRTC-related server functionality, routes, middleware, and database models.

## Installation

### Prerequisites

Make sure the following are installed and available:

- [Node.js](https://nodejs.org/)
- npm
- A MongoDB database
- A Cloudinary account
- A Google OAuth client if Google authentication is enabled

### Clone the repository

```bash
git clone https://github.com/AlenOrbanic/Brzojav-backend.git
cd Brzojav-backend
```

### Install dependencies

```bash
npm install
```

## Environment Variables

The backend requires environment variables for database access, authentication, Cloudinary, and the multi-node configuration.

Create a `.env` file:

```env
PORT=3001

MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret

GOOGLE_CLIENT_ID=your_google_client_id

NODE_ID=seed-1
NODE_SECRET=your_shared_node_secret

SELF_URL=http://localhost:3001

SEED_1_URL=http://localhost:3001
SEED_2_URL=http://localhost:3002
SEED_3_URL=http://localhost:3003

GOSSIP_INTERVAL_MS=30000

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

**Do not commit ****`.env`**** files or real credentials to Git.**

The MongoDB connection is established using `MONGODB_URI`, while authentication requires `JWT_SECRET`. The server also uses `GOOGLE_CLIENT_ID` for Google authentication.

The exact Cloudinary environment variable names should match those used by the Cloudinary configuration in `cloudinary.js`.

## Running the Backend

### Single Node

To start one backend node:

```bash
npm start
```

The default port is `3000` if `PORT` is not specified.

### Three-Node Cluster

The backend supports running three seed nodes.

The available npm scripts are:

```bash
npm run node1
npm run node2
npm run node3
```

To start all three nodes simultaneously:

```bash
npm run cluster
```

The three nodes use separate environment files:

```text
.env
.env.node2
.env.node3
```

The scripts defined in `package.json` start each node with its corresponding environment configuration.

## Backend Architecture

Brzojav uses a hybrid architecture consisting of a REST API, Socket.IO, WebRTC and MongoDB.

Users communicate with the backend through the REST API and Socket.IO. When possible, messages and files can subsequently be transferred directly between users through WebRTC.

## REST API

The backend exposes several groups of REST endpoints.

### Authentication

```text
/api/auth
```

Handles:

- registration
- login
- Google authentication
- retrieving the current user
- updating the profile
- changing the password
- blocking users
- deleting accounts

JWT tokens are generated during authentication and are valid for seven days. Passwords are hashed with bcrypt before being stored.

### Users

```text
/api/users
```

Provides functionality for:

- registering an online user
- sending heartbeats
- logging out
- maintaining the peer registry

The registry stores information such as username, IP address, P2P port, node ID, and last-seen timestamp.

### Chats

```text
/api/chats
```

Handles:

- retrieving chats
- creating direct chats
- creating groups
- updating groups
- leaving groups
- removing members
- marking chats as read
- pinning messages

### Messages

```text
/api/Messages
```

Handles:

- retrieving message history
- sending messages
- uploading files
- deleting messages
- adding reactions
- removing reactions

Message history is stored in MongoDB. Uploaded files can be sent to Cloudinary, while the resulting URLs are stored with the message.

### Link Previews

```text
/api/links
```

Provides metadata for URLs sent through the application.

## Authentication

Protected endpoints require a JWT access token.

The token is supplied using the HTTP `Authorization` header:

```http
Authorization: Bearer <token>
```

The authentication middleware validates the token and makes the authenticated username available to the route handlers.

The backend also applies rate limiting to registration and login endpoints to reduce brute-force and automated account creation attempts.

## Real-Time Communication

Socket.IO is used for real-time events between the frontend and backend.

The backend maintains a map of currently connected users:

```text
username → Socket.IO socket ID
```

This allows the server to send notifications to specific users.

Examples of real-time events include:

```text
new_message
chat_updated
chat_pinned
reactions_updated
webrtc-signal
```

The backend uses Socket.IO for WebRTC signaling and notifications rather than acting as the primary relay for peer-to-peer message contents.

## WebRTC Signaling

The backend provides the signaling layer required to establish WebRTC connections.

When a client wants to establish a connection with another user:

1. The client looks up the other user's peer information.
2. A WebRTC connection is created.
3. SDP and ICE information is generated.
4. Signaling information is sent through Socket.IO.
5. The backend forwards the signaling data to the destination user.
6. The browsers establish the WebRTC DataChannel.
7. Data can then be transferred directly between the peers.

The backend does not inspect the actual contents transferred through the WebRTC DataChannel.

## File Uploads

Files uploaded through the REST API are processed using Multer.

The backend then uploads them to Cloudinary.

Depending on the MIME type, files are categorized as:

- images
- videos
- other files

The resulting Cloudinary URL is stored with the message in MongoDB.

## Security

The backend includes several security measures:

- Helmet security headers
- JWT authentication
- bcrypt password hashing
- login rate limiting
- registration rate limiting
- CORS
- NoSQL operator filtering
- protected inter-node synchronization
- authenticated Socket.IO connections
- centralized error handling

Requests containing MongoDB operators such as `$` or keys containing `.` are filtered before reaching the application logic.

## Available Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `npm install`     | Installs dependencies            |
| `npm start`       | Starts the backend               |
| `npm run dev`     | Starts the backend using Nodemon |
| `npm run node1`   | Starts seed node 1               |
| `npm run node2`   | Starts seed node 2               |
| `npm run node3`   | Starts seed node 3               |
| `npm run cluster` | Starts all three seed nodes      |

These scripts are defined in the repository's `package.json`.

## Deployment

The backend can be deployed to a Node.js-compatible hosting provider.

When deploying multiple nodes, each node should have its own:

- `PORT`
- `NODE_ID`
- `SELF_URL`
- seed-node configuration

All nodes must share the same:

- MongoDB database
- `NODE_SECRET`

The frontend must also be configured to use the deployed backend URL.

### ! Important !
_peers.js, gossip.js and registry.js are unused in the app. they are left in case of making a desktop version of the app._

## Related Repository

Frontend:

[https://github.com/AlenOrbanic/Brzojav](https://github.com/AlenOrbanic/Brzojav)
