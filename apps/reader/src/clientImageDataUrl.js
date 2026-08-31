/**
 * 在 Zotero 前台 fetch 远程图 → data:...;base64,...
 * 部分 OpenAI 兼容接口不接受外链图片，需在客户端内联为 data URL。
 */

export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
    }
    return btoa(binary);
}

export async function fetchHttpsImageAsDataUrl(url) {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
    const mime =
        blob.type && blob.type.startsWith('image/')
            ? blob.type
            : ct.startsWith('image/')
              ? ct
              : 'image/png';
    const buf = await blob.arrayBuffer();
    return `data:${mime};base64,${arrayBufferToBase64(buf)}`;
}

/**
 * OpenAI Chat 多模态 parts：http(s) image_url → data URL
 * @param {unknown} parts
 */
export async function inlineHttpsImageUrlsInOpenAIParts(parts) {
    if (!Array.isArray(parts)) return parts;
    const out = [];
    for (const part of parts) {
        if (!part || typeof part !== 'object') {
            out.push(part);
            continue;
        }
        if (part.type === 'text') {
            out.push({ type: 'text', text: part.text ?? '' });
            continue;
        }
        if (part.type === 'image_url' && part.image_url) {
            const iu = part.image_url;
            const url = typeof iu === 'string' ? iu : iu.url;
            const detail = typeof iu === 'object' && iu.detail ? iu.detail : undefined;
            if (!url) {
                out.push(part);
                continue;
            }
            if (url.startsWith('data:')) {
                out.push({
                    type: 'image_url',
                    image_url: detail ? { url, detail } : { url },
                });
                continue;
            }
            if (/^https?:\/\//i.test(url)) {
                try {
                    const dataUrl = await fetchHttpsImageAsDataUrl(url);
                    out.push({
                        type: 'image_url',
                        image_url: detail ? { url: dataUrl, detail } : { url: dataUrl },
                    });
                } catch (e) {
                    const hint = e?.message || String(e);
                    throw new Error(`图片 URL 无法在客户端加载（需允许跨域或改用可访问地址）。${hint}`);
                }
                continue;
            }
            out.push({
                type: 'image_url',
                image_url: detail ? { url, detail } : { url },
            });
            continue;
        }
        out.push(part);
    }
    return out;
}
