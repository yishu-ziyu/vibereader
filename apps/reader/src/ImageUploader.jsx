import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PictureOutlined, ScissorOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, message } from 'antd';

/**
 * 图片上传和截图组件
 *
 * 截图功能说明：
 * - 独立网页应用使用浏览器原生 getDisplayMedia API
 * - 用户选择屏幕/窗口/标签页后自动捕获为图片
 * - 保留 postMessage 以支持 iframe 嵌入场景
 *
 * @param {Function} onImageSelect - 图片选择回调，参数为 { base64, file, type: 'upload' | 'screenshot' }
 * @param {Object} iconStyle - 图标样式
 */
const ImageUploader = ({ onImageSelect, iconStyle = {}, disabled = false, disabledTitle = '' }) => {
    const fileInputRef = useRef(null);
    const [isWaitingScreenshot, setIsWaitingScreenshot] = useState(false);

    // 处理文件选择
    const handleFileChange = useCallback((event) => {
        if (disabled) return;
        const file = event.target.files?.[0];
        if (!file) return;

        // 验证文件类型
        if (!file.type.startsWith('image/')) {
            message.error('请选择图片文件');
            return;
        }

        // 验证文件大小（限制 10MB）
        if (file.size > 10 * 1024 * 1024) {
            message.error('图片大小不能超过 10MB');
            return;
        }

        // 读取为 base64
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result;
            if (base64 && onImageSelect) {
                onImageSelect({
                    base64,
                    file,
                    type: 'upload',
                    name: file.name
                });
            }
        };
        reader.onerror = () => {
            message.error('读取图片失败');
        };
        reader.readAsDataURL(file);

        // 清空 input，允许重复选择同一文件
        event.target.value = '';
    }, [onImageSelect, disabled]);

    // 触发文件选择
    const handleUploadClick = useCallback(() => {
        if (disabled) {
            if (disabledTitle) message.warning(disabledTitle);
            return;
        }
        fileInputRef.current?.click();
    }, [disabled, disabledTitle]);

    // 监听来自父窗口的截图结果
    useEffect(() => {
        const handleMessage = (event) => {
            // 处理截图结果
            if (event.data?.type === 'screenshot-result') {
                setIsWaitingScreenshot(false);
                
                if (event.data.success && event.data.base64) {
                    console.log('[ImageUploader] 收到截图结果');
                    if (onImageSelect) {
                        onImageSelect({
                            base64: event.data.base64,
                            type: 'screenshot',
                            name: `screenshot_${Date.now()}.png`,
                            width: event.data.width,
                            height: event.data.height
                        });
                    }
                    message.success('截图成功');
                } else if (event.data.cancelled) {
                    console.log('[ImageUploader] 截图已取消');
                } else {
                    message.error('截图失败: ' + (event.data.error || '未知错误'));
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onImageSelect]);

    // 开始截图 - 使用浏览器原生 getDisplayMedia API
    const startScreenshot = useCallback(async () => {
        if (disabled) {
            if (disabledTitle) message.warning(disabledTitle);
            return;
        }

        // 检查浏览器是否支持 getDisplayMedia
        if (!navigator.mediaDevices?.getDisplayMedia) {
            message.warning('当前浏览器不支持截图功能');
            return;
        }

        setIsWaitingScreenshot(true);
        let stream = null;

        try {
            // 请求用户选择屏幕/窗口/标签页
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });

            // 创建 video 元素捕获一帧
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;

            await new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    video.play().then(resolve).catch(reject);
                };
                video.onerror = reject;
                // 5 秒超时
                setTimeout(() => reject(new Error('截图超时')), 5000);
            });

            // 绘制到 canvas
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1920;
            canvas.height = video.videoHeight || 1080;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // 转换为 base64
            const base64 = canvas.toDataURL('image/png');

            if (onImageSelect) {
                onImageSelect({
                    base64,
                    type: 'screenshot',
                    name: `screenshot_${Date.now()}.png`,
                    width: canvas.width,
                    height: canvas.height
                });
            }
            message.success('截图成功');

        } catch (error) {
            if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                console.log('[ImageUploader] 用户取消截图');
            } else {
                console.error('[ImageUploader] 截图失败:', error);
                message.error('截图失败: ' + (error.message || '未知错误'));
            }
        } finally {
            // 停止所有轨道
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            setIsWaitingScreenshot(false);
        }
    }, [onImageSelect, disabled, disabledTitle]);

    return (
        <>
            {/* 隐藏的文件输入 */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            {/* 上传图片按钮 */}
            <Button
                type="text"
                icon={<PictureOutlined />}
                onClick={handleUploadClick}
                title={disabled ? (disabledTitle || '当前模型不支持带图') : '上传图片'}
                disabled={disabled}
                style={{ ...iconStyle, opacity: disabled ? 0.45 : 1 }}
            />

            {/* 截图按钮 */}
            <Button
                type="text"
                icon={<ScissorOutlined />}
                onClick={startScreenshot}
                loading={isWaitingScreenshot}
                title={disabled ? (disabledTitle || '当前模型不支持带图') : '截图'}
                disabled={disabled}
                style={{ ...iconStyle, opacity: disabled ? 0.45 : 1 }}
            />
        </>
    );
};

export default ImageUploader;
