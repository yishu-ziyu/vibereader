const LOCAL_DEV_ORIGINS = new Set([
    'http://127.0.0.1:3217',
    'http://localhost:3217',
]);

export function resolveAiEndpointForRuntime(endpoint, origin = globalThis.location?.origin) {
    if (!endpoint || !LOCAL_DEV_ORIGINS.has(origin)) {
        return endpoint;
    }

    let parsed;
    try {
        parsed = new URL(endpoint);
    } catch (_) {
        return endpoint;
    }

    // MiniMax dev proxy routing
    if (
        (parsed.origin === 'https://api.minimax.io' || parsed.origin === 'https://api.minimaxi.com') &&
        parsed.pathname.startsWith('/anthropic/')
    ) {
        return `${parsed.pathname.replace(/^\/anthropic/, '/api/minimax')}${parsed.search}`;
    }

    // MiMo Token Plan dev proxy routing
    if (parsed.origin === 'https://token-plan-cn.xiaomimimo.com' && parsed.pathname.startsWith('/anthropic/')) {
        return `${parsed.pathname.replace(/^\/anthropic/, '/api/mimo')}${parsed.search}`;
    }

    // Kimi/Moonshot dev proxy routing
    if (parsed.origin === 'https://api.moonshot.cn' && parsed.pathname.startsWith('/v1/')) {
        return `${parsed.pathname.replace(/^\/v1/, '/api/kimi')}${parsed.search}`;
    }

    // StepFun Step Plan dev proxy routing
    if (parsed.origin === 'https://api.stepfun.com' && parsed.pathname.startsWith('/step_plan/v1/')) {
        return `${parsed.pathname.replace(/^\/step_plan\/v1/, '/api/stepfun')}${parsed.search}`;
    }

    // Local OpenAI-compatible proxy (cli-proxy-api / Antigravity on 8317)
    if (
        (parsed.origin === 'http://127.0.0.1:8317' || parsed.origin === 'http://localhost:8317') &&
        (parsed.pathname.startsWith('/v1/') || parsed.pathname === '/v1')
    ) {
        return `/api/llm-proxy${parsed.pathname}${parsed.search}`;
    }

    return endpoint;
}

/**
 * 判断当前是否需要使用 Vite dev proxy
 * Tauri 运行时使用原生 HTTP，不需要 proxy；浏览器本地开发时才需要
 */
export function shouldUseDevProxy(endpoint, origin = globalThis.location?.origin) {
    if (!endpoint || !LOCAL_DEV_ORIGINS.has(origin)) {
        return false;
    }
    return resolveAiEndpointForRuntime(endpoint, origin) !== endpoint;
}
