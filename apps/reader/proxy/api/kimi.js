/**
 * Vercel Edge Function: Kimi Priority Trial 代理
 *
 * 部署后，前端只需调用此代理，无需在客户端暴露 Kimi API Key。
 *
 * 环境变量:
 *   KIMI_API_KEY = 你的 Kimi (Moonshot) API Key
 *   VIBEREADER_PROXY_TOKEN = 调用方必须通过 x-vibereader-proxy-token 提交
 *   VIBEREADER_ORIGIN = 允许的 CORS Origin（未设置则不返回 ACAO）
 *
 * 前端配置:
 *   Base URL: https://your-proxy.vercel.app/api/kimi
 *   API Key:  (留空，代理自动填充)
 *   Model:    moonshot-v1-8k
 *   Format:   openai
 */

export const config = {
  runtime: 'edge',
};

const KIMI_BASE_URL = 'https://api.moonshot.cn/v1';

function corsHeaders() {
  const origin = (process.env.VIBEREADER_ORIGIN || '').trim();
  return origin ? { 'Access-Control-Allow-Origin': origin } : {};
}

function requireProxyToken(request) {
  const expected = (process.env.VIBEREADER_PROXY_TOKEN || '').trim();
  if (!expected) {
    return new Response(JSON.stringify({ error: 'Proxy is disabled: VIBEREADER_PROXY_TOKEN not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  const got = request.headers.get('x-vibereader-proxy-token') || '';
  if (got !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  return null;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-vibereader-proxy-token',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const authError = requireProxyToken(request);
  if (authError) return authError;

  const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: KIMI_API_KEY not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  try {
    const body = await request.text();
    const targetUrl = `${KIMI_BASE_URL}/chat/completions`;

    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body,
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: {
        'Content-Type': upstreamResponse.headers.get('content-type') || 'text/event-stream',
        ...corsHeaders(),
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }
}
