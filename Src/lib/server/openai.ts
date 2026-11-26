// OpenAI 호출 공통부. 서버 전용 (키가 브라우저로 가면 안 된다).
// 기능별 프롬프트는 각 기능 폴더에 두고(예: gcam-import/ocr.ts) 이 파일의 callJson 으로 부른다.
// "@/..." 경로를 쓰지 않는다: 터미널 시험 스크립트(node)에서도 바로 불러 쓰기 위해서.

export const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

export interface Usage {
  /** 어떤 호출인지 (예: "ocr", "group") */
  stage: string;
  model: string;
  pages?: [number, number];
  input_tokens: number;
  output_tokens: number;
  ms: number;
  retries: number;
  /** 결과를 코드가 바로잡은 내역 (품질 확인용) */
  problems?: string[];
}

/** Responses API + 구조화 출력(JSON schema). 네트워크·5xx 오류는 한 번 다시 시도한다. */
export async function callJson<T>(
  stage: string,
  schema: object,
  content: object[],
  effort: "low" | "medium" = "low",
): Promise<{ json: T; usage: Usage }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY 가 설정되지 않았어요.");

  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort },
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: stage, strict: true, schema } },
      }),
    });
    if (res.status >= 500 && attempt === 0) continue;
    const body = await res.json();
    if (!res.ok) throw new Error(`OpenAI 오류 (${res.status}): ${body.error?.message ?? "알 수 없음"}`);
    if (body.status !== "completed") throw new Error(`OpenAI 응답이 끝나지 않았어요: ${body.incomplete_details?.reason ?? body.status}`);

    const text = body.output
      .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
      .find((c: { type: string }) => c.type === "output_text")?.text;
    if (!text) throw new Error("OpenAI 응답에 결과가 없어요 (거부되었을 수 있어요).");

    return {
      json: JSON.parse(text) as T,
      usage: {
        stage,
        model: MODEL,
        input_tokens: body.usage.input_tokens,
        output_tokens: body.usage.output_tokens,
        ms: Date.now() - started,
        retries: attempt,
      },
    };
  }
}

export const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
/** 임베딩 크기. 바꾸면 저장된 임베딩(keywords, keyword_aliases)을 모두 다시 만들어야 한다 */
export const EMBED_DIMENSIONS = Number(process.env.OPENAI_EMBED_DIMENSIONS || 512);

/** 여러 글을 한 번에 임베딩한다 (키워드 파이프라인). 네트워크·5xx 오류는 한 번 다시 시도한다. */
export async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; tokens: number }> {
  if (!texts.length) return { vectors: [], tokens: 0 };
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY 가 설정되지 않았어요.");

  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += 500) {
    const input = texts.slice(i, i + 500).map((t) => t.trim() || " ");
    for (let attempt = 0; ; attempt++) {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBED_MODEL, input, dimensions: EMBED_DIMENSIONS }),
      });
      if (res.status >= 500 && attempt === 0) continue;
      const body = await res.json();
      if (!res.ok) throw new Error(`OpenAI 임베딩 오류 (${res.status}): ${body.error?.message ?? "알 수 없음"}`);
      const rows = [...body.data].sort((a: { index: number }, b: { index: number }) => a.index - b.index);
      for (const r of rows) vectors.push(r.embedding as number[]);
      tokens += body.usage?.total_tokens ?? 0;
      break;
    }
  }
  return { vectors, tokens };
}
