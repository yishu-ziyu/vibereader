/**
 * AI 请求错误分类与处理
 * 将 HTTP 状态码和网络错误映射为用户友好的中文消息
 */

export const AI_ERROR_CODES = {
  MISSING_API_KEY: 'MISSING_API_KEY',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT: 'RATE_LIMIT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  CORS: 'CORS',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN',
};

const ERROR_MESSAGES = {
  zh: {
    [AI_ERROR_CODES.MISSING_API_KEY]: {
      title: '缺少 API Key',
      message: '当前模型需要 API Key 才能使用。请在模型设置中添加有效的 API Key。',
      action: '打开模型设置',
    },
    [AI_ERROR_CODES.UNAUTHORIZED]: {
      title: 'API Key 无效',
      message: 'API Key 无效或已过期，请检查并更新您的 API Key。',
      action: '检查 API Key',
    },
    [AI_ERROR_CODES.FORBIDDEN]: {
      title: '权限不足',
      message: '当前 API Key 没有权限访问该模型，请确认 Key 的权限范围或更换模型。',
      action: '更换模型或 Key',
    },
    [AI_ERROR_CODES.RATE_LIMIT]: {
      title: '请求过于频繁',
      message: '已达到速率限制，请稍后再试。',
      action: '稍后再试',
    },
    [AI_ERROR_CODES.PROVIDER_UNAVAILABLE]: {
      title: '模型服务不可用',
      message: '模型服务暂时不可用或服务器繁忙，请稍后重试，或切换到其他模型服务。',
      action: '稍后重试或切换模型',
    },
    [AI_ERROR_CODES.TIMEOUT]: {
      title: '请求超时',
      message: '请求响应时间过长，可能是网络不稳定或服务器繁忙。',
      action: '点击重试',
    },
    [AI_ERROR_CODES.CORS]: {
      title: '跨域请求被阻止',
      message: '开发环境代理可能失效，请检查代理配置或刷新页面。',
      action: '刷新页面',
    },
    [AI_ERROR_CODES.NETWORK]: {
      title: '网络错误',
      message: '无法连接到服务器，请检查网络连接。',
      action: '检查网络并重试',
    },
    [AI_ERROR_CODES.UNKNOWN]: {
      title: '请求失败',
      message: '发生未知错误，请稍后重试。',
      action: '点击重试',
    },
  },
  en: {
    [AI_ERROR_CODES.MISSING_API_KEY]: {
      title: 'Missing API Key',
      message: 'This model requires an API Key. Please add a valid API Key in model settings.',
      action: 'Open Model Settings',
    },
    [AI_ERROR_CODES.UNAUTHORIZED]: {
      title: 'Invalid API Key',
      message: 'The API Key is invalid or expired. Please check and update your API Key.',
      action: 'Check API Key',
    },
    [AI_ERROR_CODES.FORBIDDEN]: {
      title: 'Permission Denied',
      message: 'Your API Key does not have permission to access this model. Please check key permissions or switch models.',
      action: 'Switch Model or Key',
    },
    [AI_ERROR_CODES.RATE_LIMIT]: {
      title: 'Rate Limit Exceeded',
      message: 'Too many requests. Please wait a moment before trying again.',
      action: 'Try Again Later',
    },
    [AI_ERROR_CODES.PROVIDER_UNAVAILABLE]: {
      title: 'Model Service Unavailable',
      message: 'The model provider is temporarily unavailable or overloaded. Please retry later or switch providers.',
      action: 'Retry Later or Switch Provider',
    },
    [AI_ERROR_CODES.TIMEOUT]: {
      title: 'Request Timeout',
      message: 'The request took too long. This may be due to network instability or server overload.',
      action: 'Retry',
    },
    [AI_ERROR_CODES.CORS]: {
      title: 'CORS Error',
      message: 'The development proxy may be down. Please check proxy configuration or refresh the page.',
      action: 'Refresh Page',
    },
    [AI_ERROR_CODES.NETWORK]: {
      title: 'Network Error',
      message: 'Unable to connect to the server. Please check your network connection.',
      action: 'Check Network and Retry',
    },
    [AI_ERROR_CODES.UNKNOWN]: {
      title: 'Request Failed',
      message: 'An unknown error occurred. Please try again later.',
      action: 'Retry',
    },
  },
};

function isZhLocale() {
  const loc = (typeof navigator !== 'undefined' ? navigator.language : '') || 'zh-CN';
  return String(loc).toLowerCase().startsWith('zh');
}

function getLang() {
  return isZhLocale() ? 'zh' : 'en';
}

/**
 * 根据 HTTP 状态码和错误信息分类错误
 * @param {number|null} statusCode
 * @param {string} message
 * @param {Error|null} originalError
 * @returns {{code: string, title: string, message: string, action: string, originalError: Error|null}}
 */
export function classifyAiError(statusCode, message, originalError = null) {
  const lang = getLang();
  const table = ERROR_MESSAGES[lang];

  // 1. 401 Unauthorized
  if (statusCode === 401) {
    return {
      code: AI_ERROR_CODES.UNAUTHORIZED,
      ...table[AI_ERROR_CODES.UNAUTHORIZED],
      originalError,
    };
  }

  // 2. 403 Forbidden
  if (statusCode === 403) {
    return {
      code: AI_ERROR_CODES.FORBIDDEN,
      ...table[AI_ERROR_CODES.FORBIDDEN],
      originalError,
    };
  }

  // 3. 429 Rate Limit
  if (statusCode === 429) {
    return {
      code: AI_ERROR_CODES.RATE_LIMIT,
      ...table[AI_ERROR_CODES.RATE_LIMIT],
      originalError,
    };
  }

  // 4. Provider unavailable / gateway errors
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return {
      code: AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
      ...table[AI_ERROR_CODES.PROVIDER_UNAVAILABLE],
      originalError,
    };
  }

  // 5. 网络超时
  if (
    message?.includes('timeout') ||
    message?.includes('timed out') ||
    message?.includes('ETIMEDOUT') ||
    originalError?.name === 'TimeoutError' ||
    originalError?.code === 'ETIMEDOUT'
  ) {
    return {
      code: AI_ERROR_CODES.TIMEOUT,
      ...table[AI_ERROR_CODES.TIMEOUT],
      originalError,
    };
  }

  // 6. CORS 错误
  if (
    message?.includes('CORS') ||
    message?.includes('cross-origin') ||
    message?.includes('Failed to fetch') ||
    (originalError?.name === 'TypeError' && message?.includes('fetch'))
  ) {
    return {
      code: AI_ERROR_CODES.CORS,
      ...table[AI_ERROR_CODES.CORS],
      originalError,
    };
  }

  // 7. 网络错误
  if (
    message?.includes('network') ||
    message?.includes('Network') ||
    message?.includes('ECONNREFUSED') ||
    message?.includes('ENOTFOUND') ||
    message?.includes('ERR_CONNECTION') ||
    originalError?.name === 'NetworkError' ||
    originalError?.code === 'ECONNREFUSED' ||
    originalError?.code === 'ENOTFOUND'
  ) {
    return {
      code: AI_ERROR_CODES.NETWORK,
      ...table[AI_ERROR_CODES.NETWORK],
      originalError,
    };
  }

  // 8. 未知错误
  return {
    code: AI_ERROR_CODES.UNKNOWN,
    ...table[AI_ERROR_CODES.UNKNOWN],
    originalError,
  };
}

/**
 * 从 fetch Response 中提取错误信息
 * @param {Response} response
 * @returns {Promise<{statusCode: number, message: string}>}
 */
export async function extractErrorFromResponse(response) {
  const statusCode = response.status;
  let message = `API 请求失败: ${statusCode}`;

  try {
    const errData = await response.json();
    const backendDetail =
      errData.error?.message || errData.message || errData.detail || '';
    if (backendDetail) {
      message += ` - ${backendDetail}`;
    }
  } catch (_) {
    // 忽略解析失败
  }

  return { statusCode, message };
}

/**
 * 构建用户友好的错误内容（用于气泡显示）
 * @param {{code: string, title: string, message: string, action: string}} errorInfo
 * @returns {string} Markdown 格式
 */
export function buildUserFriendlyErrorContent(errorInfo) {
  const { title, message, action } = errorInfo;
  return `❌ **${title}**\n\n${message}\n\n💡 **建议**: ${action}。`;
}
