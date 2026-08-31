const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = 'https://api.minimaxi.com/anthropic';

if (!API_KEY) {
  console.error('错误: 请设置环境变量 MINIMAX_API_KEY');
  process.exit(1);
}

async function testMinimax() {
  console.log('=== MiniMax Token Plan 连通性测试 ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Model: MiniMax-M2.7`);
  console.log(`API Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}\n`);

  const body = {
    model: 'MiniMax-M2.7',
    max_tokens: 200,
    stream: true,
    messages: [{ role: 'user', content: '你好，请用一句话介绍自己。' }],
  };

  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/v1/messages`, {
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
    let thinkingText = '';
    let chunkCount = 0;
    let thinkingChunkCount = 0;

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
          if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta.text) {
            fullText += data.delta.text;
            chunkCount++;
            process.stdout.write(data.delta.text);
          }
          if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta' && data.delta.thinking) {
            thinkingText += data.delta.thinking;
            thinkingChunkCount++;
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
    console.log(`Text chunk 数: ${chunkCount}`);
    console.log(`Thinking chunk 数: ${thinkingChunkCount}`);
    console.log(`总字符数: ${fullText.length}`);
    if (thinkingText) {
      console.log(`\n--- Thinking 内容 (${thinkingText.length} chars) ---`);
      console.log(thinkingText.slice(0, 300) + (thinkingText.length > 300 ? '...' : ''));
    }
    console.log('\n✅ 测试通过！MiniMax Token Plan 连接正常。');

  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    process.exit(1);
  }
}

testMinimax();
