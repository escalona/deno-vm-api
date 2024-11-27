# Deno VM API

A Fastify-based API service that provides a secure environment for executing
TypeScript/JavaScript code using the [deno-vm](https://github.com/casual-simulation/node-deno-vm) project.

## Features

- Secure code execution through deno-vm:
- Redis-based script storage
- Console output capturing

## Prerequisites

- Node.js (v20 or higher)
- Deno v1.44.4
- Redis
- Docker (optional)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with the following variables:
```env
NODE_ENV=development
REDIS_URL=redis://localhost:6379
```

## Usage

### Local Development

Run the service in development mode with hot reload:
```bash
npm run dev
```

### Using Docker

Start the service using Docker Compose:
```bash
# Build and start services
docker compose up --build

# Start in background
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f web
```

The service will be available at `http://localhost:8000`

### Production

Build and start the service:
```bash
npm run build
npm start
```

## API Endpoints

### GET /up
Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

### POST /eval
Execute TypeScript/JavaScript code.

**Request Body:**
```json
{
  "code": "console.log('Hello, World!');"
}
```

**Response:**
```json
{
  "ok": true,
  "duration": 123,
  "logs": [
    {
      "level": "log",
      "args": ["Hello, World!"]
    }
  ]
}
```

## Example Usage

```bash
# Execute code using curl
curl -X POST http://localhost:8000/eval \
  -H "Content-Type: application/json" \
  -d '{"code": "console.log(\"Hello from Deno VM!\");"}'
```

## How It Works

This project leverages the `deno-vm` package to provide secure code execution capabilities:

1. Code submitted through the API is wrapped in a worker script
2. The script is temporarily stored in Redis
3. A Deno worker is spawned to execute the code in an isolated environment
4. Results and console output are captured and returned
5. The worker is terminated after execution

### Security Features from deno-vm

The code execution environment benefits from deno-vm's security features:
- Out-of-process execution
- Configurable permissions system
- Isolated runtime environment
- Cross-platform support (Windows, MacOS, and Linux)

## License

[MIT](./LICENSE)
