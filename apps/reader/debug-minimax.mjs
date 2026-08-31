const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = 'https://api.minimaxi.com/anthropic';

async function debug() {
  const response = await fetch(`${BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      max_tokens: 100,
      stream: true,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  });

  console.log('Status:', response.status, response.statusText);
  console.log('Content-Type:', response.headers.get('content-type'));
  console.log('--- Raw SSE lines ---');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lineCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      lineCount++;
      console.log(`[${lineCount}] ${line}`);
      if (line.trim().startsWith('data:')) {
        const data = line.trim().slice(5).trim();
        if (data && data !== '[DONE]') {
          try {
            const obj = JSON.parse(data);
            console.log('  → parsed type:', obj.type, 'keys:', Object.keys(obj).join(', '));
          } catch (e) {
            console.log('  → NOT JSON:', data.slice(0, 100));
          }
        }
      }
    }

    if (done) break;
  }
  console.log(`--- End (${lineCount} lines) ---`);
}

debug().catch(console.error);
