import { ChatMessage } from '../types';

/**
 * 将对话历史导出为 Markdown 格式
 */
export const exportAsMarkdown = (messages: ChatMessage[]): string => {
  const lines: string[] = [];
  lines.push('# UndyDraw 对话记录');
  lines.push('');
  lines.push(`导出时间：${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    if (msg.isError) continue;

    const roleLabel = msg.role === 'user' ? '用户' : '模型';
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    lines.push(`## ${roleLabel} (${time})`);
    lines.push('');

    // Thinking parts
    const thinkingParts = msg.parts.filter(p => p.thought && p.text);
    if (thinkingParts.length > 0) {
      lines.push('<details>');
      lines.push(`<summary>思考过程${msg.thinkingDuration ? ` (${msg.thinkingDuration.toFixed(1)}s)` : ''}</summary>`);
      lines.push('');
      thinkingParts.forEach(p => {
        if (p.text) lines.push(p.text);
      });
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    // Regular text parts
    const textParts = msg.parts.filter(p => p.text && !p.thought);
    textParts.forEach(p => {
      if (p.text) lines.push(p.text);
    });

    // Image count
    const imageCount = msg.parts.filter(p => p.inlineData && !p.thought).length;
    if (imageCount > 0) {
      lines.push('');
      lines.push(`*[${imageCount} 张图片]*`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
};

/**
 * 下载文本内容为文件
 */
export const downloadExport = (content: string, filename: string, mimeType: string = 'text/markdown') => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
