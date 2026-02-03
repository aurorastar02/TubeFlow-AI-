
export enum DownloadFormat {
  MP3 = 'MP3',
  MP4 = 'MP4'
}

export enum AudioQuality {
  LOW = '128kbps',
  MEDIUM = '192kbps',
  HIGH = '320kbps'
}

export enum VideoQuality {
  P360 = '360p',
  P720 = '720p',
  P1080 = '1080p',
  P4K = '4K'
}

export interface VideoMetadata {
  title: string;
  author: string;
  duration: string;
  thumbnail: string;
  views: string;
  availableQualities: string[];
}

export interface DownloadTask {
  id: string;
  url: string;
  title: string;
  format: DownloadFormat;
  quality: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  timestamp: number;
}
