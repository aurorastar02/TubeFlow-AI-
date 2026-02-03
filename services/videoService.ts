
import { VideoMetadata } from "../types";

export const fetchVideoMetadata = async (url: string): Promise<VideoMetadata> => {
  try {
    const response = await fetch('http://localhost:5000/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "無法從本地引擎獲取資訊");
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
  } catch (error) {
    console.error("Error connecting to Python backend:", error);
    throw error;
  }
};
