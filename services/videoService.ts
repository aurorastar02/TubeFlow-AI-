import { VideoMetadata } from "../types.ts";

export const fetchVideoMetadata = async (url: string): Promise<VideoMetadata> => {
  try {
    const response = await fetch('http://localhost:5000/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 如果後端給出具體錯誤（如影片不存在、不支援區域），直接拋出該訊息
      throw new Error(errorData.error || `引擎錯誤: ${response.status} (請確認影片網址是否正確)`);
    }

    const data = await response.json();
    return {
      title: data.title || "未知影片",
      author: data.author || "未知頻道",
      duration: data.duration || "00:00",
      thumbnail: data.thumbnail || `https://picsum.photos/640/360`,
      views: data.views || "0",
      availableQualities: data.availableQualities || ["360p", "720p", "1080p"]
    };
  } catch (error: any) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error("無法連接到本地引擎 (請確認 Python 腳本是否已啟動並運行在 5000 端口)");
    }
    throw error;
  }
};