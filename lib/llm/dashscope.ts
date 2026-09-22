import "server-only";

/** OpenAI-compatible Chat Completions (阿里云百炼). */
export type DashScopeChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function isDashScopeConfigured(): boolean {
  return Boolean(process.env.DASHSCOPE_API_KEY?.trim());
}

export function getDashScopeConfig() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const baseUrl = (
    process.env.DASHSCOPE_BASE_URL?.trim() ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/, "");
  const model = process.env.DASHSCOPE_MODEL?.trim() || "qwen-plus";
  return { apiKey, baseUrl, model };
}

const DASHSCOPE_TIMEOUT_MS = 20_000;
const DASHSCOPE_MAX_RESPONSE_BYTES = 256 * 1024;

/** Calls Qwen chat completions (JSON mode optional). */
export async function dashScopeChatCompletion(params: {
  messages: DashScopeChatMessage[];
  temperature?: number;
  responseFormat?: "json_object" | "text";
}): Promise<string> {
  const config = getDashScopeConfig();
  if (!config) {
    throw new Error("DASHSCOPE_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DASHSCOPE_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.15,
        ...(params.responseFormat === "text"
          ? {}
          : { response_format: { type: "json_object" } }),
      }),
      signal: controller.signal,
    });

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > DASHSCOPE_MAX_RESPONSE_BYTES) {
      throw new Error("DASHSCOPE_RESPONSE_TOO_LARGE");
    }
    const responseBytes = await res.arrayBuffer();
    if (responseBytes.byteLength > DASHSCOPE_MAX_RESPONSE_BYTES) {
      throw new Error("DASHSCOPE_RESPONSE_TOO_LARGE");
    }
    const raw = new TextDecoder().decode(responseBytes);
    if (!res.ok) {
      console.error("DashScope error", res.status, raw.slice(0, 500));
      throw new Error(`DASHSCOPE_HTTP_${res.status}`);
    }

    let payload: { choices?: Array<{ message?: { content?: string } }> };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      throw new Error("DASHSCOPE_BAD_JSON");
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("DASHSCOPE_EMPTY");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;
  return JSON.parse(jsonText);
}
