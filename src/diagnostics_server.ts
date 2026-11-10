import { createServer } from "node:http";
import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { ReleaseKnowledgeService } from "./release_knowledge.js";

const entrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  eventType: z.enum(["build", "release", "diagnostic"]),
});
const indexSchema = z.object({ collection: z.string().min(1), entries: z.array(entrySchema).min(1) });
const diagnoseSchema = z.object({ collection: z.string().min(1), question: z.string().min(3) });

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const service = new ReleaseKnowledgeService(new InfraiClient(apiKey));

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/knowledge/index") {
      const input = indexSchema.parse(await readJson(request));
      send(response, 200, await service.index(input.collection, input.entries));
      return;
    }
    if (request.method === "POST" && request.url === "/diagnostics/query") {
      const input = diagnoseSchema.parse(await readJson(request));
      send(response, 200, await service.diagnose(input.collection, input.question));
      return;
    }
    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) send(response, 400, { error: "Invalid request", details: error.flatten() });
    else if (error instanceof InfraiError) send(response, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code ?? error.message, details: error.details });
    else send(response, 500, { error: "Request could not be completed" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log("Release diagnostics service listening on http://localhost:3000"));
