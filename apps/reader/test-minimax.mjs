/**
 * MiniMax Token Plan 连通性测试脚本
 * 用法: MINIMAX_API_KEY=your_key node test-minimax.mjs
 */

const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = 'https://api.minimaxi.com/anthropic';

if (!API_KEY) {
  console.error('错误: 请设置环境变量 MINIMAX_API_KEY');
  console.error('用法: MINIMAX_API_KEY=your_key node test-minimax.mjs');
  process.exit(1);
}

async function testMinimax() {
  console.log('=== MiniMax Token Plan 连通性测试 ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Model: MiniMax-M2.7`);
  console.log(`API Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}\n`);

  const endpoint = `${BASE_URL}/v1/messages`;
  const body = {
    model: 'MiniMax-M2.7',
    max_tokens: 100,
    stream: true,
    messages: [{ role: 'user', content: '你好，请用一句话介绍自己。' }],
  };

  console.log(`请求: POST ${endpoint}`);
  console.log(`请求体: ${JSON.stringify(body, null, 2)}\n`);

  const startTime = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    console.log(`响应状态: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error('\n错误响应:', errText);
      process.exit(1);
    }

    console.log('\n--- 开始接收流式响应 ---\n');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          // Anthropic SSE 格式
          if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta.text) {
            const text = data.delta.text;
            fullText += text;
            chunkCount++;
            process.stdout.write(text);
          }
        } catch {
          // 忽略非 JSON 行
        }
      }

      if (done) break;
    }

    const elapsed = Date.now() - startTime;
    console.log('\n\n--- 流式响应结束 ---');
    console.log(`总耗时: ${elapsed}ms`);
    console.log(`Chunk 数: ${chunkCount}`);
    console.log(`总字符数: ${fullText.length}`);
    console.log(`首字节时间(TTFB): ~${elapsed / chunkCount}ms/chunk`);
    console.log('\n✅ 测试通过！MiniMax Token Plan 连接正常。');

  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    process.exit(1);
  }
}

testMinimax();
