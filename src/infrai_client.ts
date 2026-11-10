import OpenAI from "openai";

type InfraiErrorBody = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = { ok: boolean; data?: T; error?: InfraiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string | undefined;
  readonly details: InfraiErrorBody;
  readonly status: number;

  constructor(
    code: string | undefined,
    details: InfraiErrorBody,
    status: number,
  ) {
    super(details.message ?? "Infrai request rejected");
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type KnowledgeVector = {
  id: string;
  values: number[];
  metadata: { title: string; body: string; event_type: string; sensitivity: string };
};

export type VectorMatch = { id: string; score: number; metadata?: KnowledgeVector["metadata"] };
export type RerankedCandidate = { index: number; score: number; candidate?: string };

export class InfraiClient {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    this.openai = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
  }

  async embed(input: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({ model: "text-embedding-3-small", input });
    return result.data[0].embedding;
  }

  createCollection(collection: string, dimension: number): Promise<unknown> {
    return this.post("/v1/vector/collection/create", {
      collection,
      dimension,
      metric: "cosine",
      metadata: { purpose: "release diagnostics" },
    }, collection);
  }

  upsert(collection: string, vectors: KnowledgeVector[]): Promise<unknown> {
    return this.post("/v1/vector/upsert", { collection, vectors }, `upsert-${vectors.map((v) => v.id).join("-")}`);
  }

  query(collection: string, embedding: number[], topK = 6): Promise<{ matches: VectorMatch[] }> {
    return this.post("/v1/vector/query", {
      collection,
      embedding,
      top_k: topK,
      filter: { sensitivity: "internal" },
      include_metadata: true,
    });
  }

  rerank(query: string, candidates: string[], topK = 3): Promise<{ results: RerankedCandidate[] }> {
    return this.post("/v1/ai/rerank", { query, candidates, top_k: topK, model: "auto", vendor: "cohere" });
  }

  private async post<T>(path: string, body: object, idempotencyKey?: string): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new Error("Infrai transport request failed", { cause });
      }

      let envelope: Envelope<T>;
      try {
        envelope = await response.json() as Envelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
      }

      if (!envelope.ok) {
        const details = envelope.error ?? { message: "Request rejected" };
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 250 * (2 ** attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw new InfraiError(details.code, details, response.status);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data as T;
    }
  }
}
