const redisUrl = firstConfigured(
  process.env.CVAR_REDIS_KV_REST_API_URL,
  process.env.KV_REST_API_URL,
  process.env.UPSTASH_REDIS_REST_URL,
);
const redisToken = firstConfigured(
  process.env.CVAR_REDIS_KV_REST_API_TOKEN,
  process.env.KV_REST_API_TOKEN,
  process.env.UPSTASH_REDIS_REST_TOKEN,
);

function firstConfigured(...values: Array<string | undefined>) {
  return values.find((value) => Boolean(value?.trim()));
}

export function redisIsConfigured() {
  return Boolean(redisUrl && redisToken);
}

export async function redisCommand(command: Array<string | number>) {
  return redisRequest('', command);
}

export async function redisPipeline(commands: Array<Array<string | number>>) {
  const result = await redisRequest('/pipeline', commands);
  if (!Array.isArray(result)) throw new Error('Redis returned an invalid pipeline response');
  for (const item of result as Array<{ error?: string }>) {
    if (item?.error) throw new Error(item.error);
  }
  return result;
}

async function redisRequest(path: string, bodyValue: unknown) {
  if (!redisUrl || !redisToken) throw new Error('Redis is not configured');
  const response = await fetch(`${redisUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${redisToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(bodyValue),
  });
  if (!response.ok) throw new Error(`Redis returned ${response.status}`);
  const body = await response.json() as { result?: unknown; error?: string } | Array<{ result?: unknown; error?: string }>;
  if (!Array.isArray(body) && body.error) throw new Error(body.error);
  return path ? body : (body as { result?: unknown }).result;
}
