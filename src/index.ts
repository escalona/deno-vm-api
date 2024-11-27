import Fastify, { FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import Redis from "ioredis";
import { DenoWorker, MessageEvent } from "deno-vm";

interface WorkerMesssageResponse {
  type: "response" | "error";
  data: string;
}

const SCRIPTS_KEY = "scripts";

const kv = new Redis(process.env.REDIS_URL!);

async function getScript(id: string): Promise<string | null> {
  const key = `${SCRIPTS_KEY}:${id}`;
  return kv.get(key);
}

async function setScript(
  content: string,
  ttlMs: number = 30000,
): Promise<string> {
  const id = crypto.randomUUID();
  const key = `${SCRIPTS_KEY}:${id}`;

  await kv.set(key, content, "EX", ttlMs / 1000);
  return `/scripts/${id}`;
}

function generateScript(code: string) {
  const escapedCodeString = JSON.stringify(code);

  return `
  type Log = {
    level: string;
    args: unknown[];
  };

  async function execute(
    code: string,
  ): Promise<{ ok: true; logs: Log[] } | { ok: false; error: string }> {
    globalThis.console = new Proxy(console, {
      get(target, key) {
        const real = target[key];
        if (typeof real === "function" && typeof key === "string") {
          const fn = function (...args: any[]) {
            logs.push({
              level: key,
              args,
            });
            return real.call(this, ...args);
          };
          return fn;
        }
      },
    });
    const logs: Log[] = [];
    async function run() {
      try {
        await import(url);
      } catch (e) {
        logs.push({
          level: "error",
          args: [e.message],
        });
      }
    }

    const blob = new Blob([code], {
      type: "text/tsx",
    });
    const url = URL.createObjectURL(blob);

    const start = performance.now();
    try {
      await run();
      return {
        ok: true,
        duration: performance.now() - start,
        logs,
      };
    } catch (error) {
      return {
        ok: false,
        duration: performance.now() - start,
        error: error.message,
      };
    }
  }

  try {
    const result = await execute(${escapedCodeString});
    self.postMessage({ type: "response", data: result });
  } finally {
    self.close();
  }
`;
}

const envToLogger: Record<string, any> = {
  development: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
  production: true,
  test: false,
};

const fastify = Fastify({
  logger: envToLogger[process.env.NODE_ENV as string] ?? true,
});

// Register the CORS plugin
fastify.register(cors, {
  // CORS options
  origin: true, // Reflects the request origin. Set to specific origins for more security
  methods: ["GET", "POST"], // Allowed HTTP methods
  credentials: true, // Allows cookies to be sent with requests
  maxAge: 86400, // How long the results of a preflight request can be cached (in seconds)
});

fastify.get("/up", async (request, reply) => {
  return { status: "ok" };
});

fastify.get(
  "/scripts/:id",
  async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const script = await getScript(id);

    if (script) {
      return reply
        .code(200)
        .header("Content-Type", "application/typescript")
        .send(script);
    }
    return reply.code(404).send();
  },
);

fastify.post(
  "/eval",
  async (request: FastifyRequest<{ Body: { code: string } }>, reply) => {
    const { code } = request.body;

    if (!code) {
      return reply.code(400).send({ error: "Missing code" });
    }

    const script = generateScript(code);

    const scriptUrl = await setScript(script);
    const fullScriptUrl = new URL(
      scriptUrl,
      fastify.listeningOrigin,
    ).toString();

    const worker = new DenoWorker(new URL(fullScriptUrl), {
      permissions: { allowNet: true, allowEnv: true },
    });

    const workerMessage = new Promise<WorkerMesssageResponse>((resolve) => {
      worker.onmessage = (e: MessageEvent) => {
        return resolve(e.data);
      };
    });

    // Wait for the worker to respond
    const workerMessageResponse = await workerMessage;

    if (workerMessageResponse?.type !== "response") {
      // Terminate the worker after we're done with it
      worker.terminate();
      return reply.code(500).send({ error: workerMessageResponse });
    }

    const data = workerMessageResponse.data || {};

    // Terminate the worker after we're done with it
    worker.terminate();

    return reply.send(data);
  },
);

const PORT = (process.env.PORT as unknown as number) || 8000;
fastify.listen({ host: "0.0.0.0", port: PORT }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
