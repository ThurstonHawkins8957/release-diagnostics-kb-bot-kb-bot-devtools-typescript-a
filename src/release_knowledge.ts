import type { InfraiClient, KnowledgeVector } from "./infrai_client.js";

export type KnowledgeEntry = {
  id: string;
  title: string;
  body: string;
  eventType: "build" | "release" | "diagnostic";
};

export type DiagnosticAnswer = {
  disposition: "answer" | "maintainer_review";
  answer: string | null;
  sources: Array<{ id: string; title: string; score: number }>;
};

export class ReleaseKnowledgeService {
  private readonly infrai: Pick<InfraiClient, "embed" | "createCollection" | "upsert" | "query" | "rerank">;

  constructor(infrai: Pick<InfraiClient, "embed" | "createCollection" | "upsert" | "query" | "rerank">) {
    this.infrai = infrai;
  }

  async index(collection: string, entries: KnowledgeEntry[]): Promise<{ indexed: number }> {
    const embedded = await Promise.all(entries.map(async (entry): Promise<KnowledgeVector> => ({
      id: entry.id,
      values: await this.infrai.embed(`${entry.title}\n${entry.body}`),
      metadata: {
        title: entry.title,
        body: entry.body,
        event_type: entry.eventType,
        sensitivity: "internal",
      },
    })));
    await this.infrai.createCollection(collection, embedded[0].values.length);
    await this.infrai.upsert(collection, embedded);
    return { indexed: entries.length };
  }

  async diagnose(collection: string, question: string): Promise<DiagnosticAnswer> {
    const embedding = await this.infrai.embed(question);
    const { matches } = await this.infrai.query(collection, embedding);
    const candidates = matches.map((match) => `${match.metadata?.title ?? match.id}\n${match.metadata?.body ?? ""}`);
    if (candidates.length === 0) return { disposition: "maintainer_review", answer: null, sources: [] };

    const { results } = await this.infrai.rerank(question, candidates);
    const selected = results
      .filter((result) => result.score >= 0.72)
      .map((result) => ({ result, match: matches[result.index] }))
      .filter((item) => item.match);

    if (selected.length === 0) {
      return { disposition: "maintainer_review", answer: null, sources: [] };
    }

    return {
      disposition: "answer",
      answer: selected.map(({ match }) => match.metadata?.body).filter(Boolean).join("\n\n"),
      sources: selected.map(({ result, match }) => ({
        id: match.id,
        title: match.metadata?.title ?? match.id,
        score: result.score,
      })),
    };
  }
}
