
import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Youtube, 
  Music, 
  Video, 
  Search, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ChevronDown,
  X,
  Copy,
  Zap,
  Settings
} from 'lucide-react';
import { 
  DownloadFormat, 
  AudioQuality, 
  VideoQuality, 
  VideoMetadata, 
  DownloadTask 
} from './types.ts';
import { fetchVideoMetadata } from './services/videoService.ts';

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [format, setFormat] = useState<DownloadFormat>(DownloadFormat.MP4);
  const [quality, setQuality] = useState<string>(VideoQuality.P720);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'info' | 'warning'} | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const pythonScript = `
import os
import yt_dlp
import datetime
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DOWNLOAD_DIR = 'tube_downloads'
if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "running", "engine": "yt-dlp"})

@app.route('/info', methods=['POST'])
def get_info():
    try:
        data = request.json
        video_url = data.get('url')
        ydl_opts = {'quiet': True, 'noplaylist': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            duration_sec = info.get('duration', 0)
            duration_str = str(datetime.timedelta(seconds=duration_sec))
            
            return jsonify({
                "title": info.get('title'),
                "author": info.get('uploader'),
                "duration": duration_str,
                "thumbnail": info.get('thumbnail'),
                "views": f"{info.get('view_count', 0):,}",
                "availableQualities": ["360p", "720p", "1080p", "4K"]
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/download', methods=['POST'])
def download():
    try:
        data = request.json
        video_url = data.get('url')
        fmt = data.get('format')
        quality = data.get('quality')
        height = quality.replace('p', '') if 'p' in quality else '720'
        
        ydl_opts = {
            'outtmpl': f'{DOWNLOAD_DIR}/%(title)s.%(ext)s',
            'noplaylist': True,
            'quiet': True,
        }
        
        if fmt == 'MP3':
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': quality.replace('kbps', '') if 'kbps' in quality else '320',
                }],
            })
        else:
            ydl_opts['format'] = f'bestvideo[height<={height}]+bestaudio/best/best'

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            filename = ydl.prepare_filename(info)
            if fmt == 'MP3':
                filename = os.path.splitext(filename)[0] + '.mp3'
            return send_file(filename, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("TubeFlow Engine 啟動成功！")
    print("不需 Gemini API，100% 本地解析。")
    print("URL: http://localhost:5000")
    print("=" * 50)
    app.run(port=5000)
  `.trim();

  const checkBackend = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('http://localhost:5000/health', { signal: controller.signal });
      const data = await res.json();
      setIsBackendConnected(data.status === 'running');
      clearTimeout(timeoutId);
    } catch {
      setIsBackendConnected(false);
    }
  };

  useEffect(() => {
    checkBackend();
    const timer = setInterval(checkBackend, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleFetchMetadata = async () => {
    if (!url.trim()) {
      setError("請貼入網址");
      return;
    }
    if (!isBackendConnected) {
      setError("請啟動本地引擎");
      setShowSetupModal(true);
      return;
    }
    setError(null);
    setIsFetching(true);
    setMetadata(null);
    try {
      const data = await fetchVideoMetadata(url);
      setMetadata(data);
    } catch (err: any) {
      setError(err.message || "連線失敗");
    } finally {
      setIsFetching(false);
    }
  };

  const startRealDownload = async (task: DownloadTask) => {
    if (!isBackendConnected) {
      setShowSetupModal(true);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed' } : t));
      return;
    }

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'downloading' } : t));
    
    try {
      const response = await fetch('http://localhost:5000/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: task.url,
          format: task.format,
          quality: task.quality
        })
      });

      if (!response.ok) throw new Error("下載處理失敗");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${task.title}.${task.format.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed', progress: 100 } : t));
      setNotification({ message: "下載成功", type: 'success' });
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed' } : t));
      setNotification({ message: "下載失敗", type: 'warning' });
    }
  };

  const handleAddTask = () => {
    if (!metadata) return;
    const newTask: DownloadTask = {
      id: Math.random().toString(36).substr(2, 9),
      url,
      title: metadata.title,
      format,
      quality,
      status: 'pending',
      progress: 0,
      timestamp: Date.now()
    };
    setTasks(prev => [newTask, ...prev]);
    startRealDownload(newTask);
  };

  const copyScript = () => {
    navigator.clipboard.writeText(pythonScript);
    setNotification({ message: "腳本已複製", type: 'success' });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-20 selection:bg-red-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/60 backdrop-blur-xl px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-red-600 to-red-800 p-2 rounded-xl">
              <Youtube className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-white">TubeFlow <span className="text-red-600">Pure</span></h1>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black border transition-colors ${
              isBackendConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isBackendConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`}></div>
              {isBackendConnected ? '本地引擎：運作中' : '本地引擎：斷開'}
            </div>
            <button onClick={() => setShowSetupModal(true)} className="p-2 text-slate-500 hover:text-white transition-colors bg-white/5 rounded-xl border border-white/5">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-16 space-y-12">
        <section className="text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-5xl md:text-7xl font-black text-white leading-tight tracking-tight">
              隱私。速度。 <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-orange-500 to-amber-500">100% 離線解析。</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg font-medium">
              不再將數據傳送至外部 API。所有影片解析與下載均由您本地的電腦完成。
            </p>
          </div>

          <div className="relative max-w-2xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-600 rounded-3xl blur opacity-10 group-hover:opacity-30 transition duration-500"></div>
            <div className="relative flex flex-col md:flex-row gap-3">
              <div className="relative flex-grow">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" />
                <input 
                  type="text"
                  placeholder="貼上網址..."
                  className="w-full bg-slate-900/50 border border-white/10 rounded-2xl py-5 pl-14 pr-6 focus:outline-none focus:border-red-600/50 transition-all text-white text-lg font-bold backdrop-blur-md"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchMetadata()}
                />
              </div>
              <button 
                onClick={handleFetchMetadata}
                disabled={isFetching}
                className="bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-black px-10 py-5 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl text-lg group active:scale-95"
              >
                {isFetching ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6 fill-current group-hover:scale-110" />}
                解析
              </button>
            </div>
            {error && <div className="absolute -bottom-8 left-2 flex items-center gap-2 text-red-500 text-sm font-bold animate-pulse"><AlertCircle className="w-4 h-4" /> {error}</div>}
          </div>
        </section>

        {metadata && (
          <div className="glass-card rounded-[2.5rem] p-8 md:p-10 animate-in fade-in zoom-in-95 border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/5 blur-[100px] -mr-40 -mt-40"></div>
            <div className="flex flex-col md:flex-row gap-10 relative z-10">
              <div className="w-full md:w-5/12 aspect-video rounded-3xl overflow-hidden border border-white/10 group">
                <img src={metadata.thumbnail} className="w-full h-full object-cover transition-transform group-hover:scale-105" alt="Thumb" />
                <div className="absolute bottom-4 right-4 bg-black/80 px-3 py-1 rounded-xl text-xs font-black text-white">{metadata.duration}</div>
              </div>
              <div className="flex-grow space-y-6">
                <div>
                  <h3 className="text-2xl font-black text-white mb-2 truncate">{metadata.title}</h3>
                  <div className="flex items-center gap-3 text-slate-500 font-bold text-sm">
                    <span className="bg-red-600/10 text-red-500 px-2 py-0.5 rounded-lg">VERIFIED</span>
                    {metadata.author} • {metadata.views} 次觀看
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">格式</label>
                    <div className="flex bg-slate-950/50 p-1 rounded-2xl border border-white/5">
                      <button onClick={() => setFormat(DownloadFormat.MP4)} className={`flex-1 py-3 rounded-xl text-xs font-black ${format === DownloadFormat.MP4 ? 'bg-slate-800 text-white shadow-xl' : 'text-slate-600'}`}>MP4</button>
                      <button onClick={() => setFormat(DownloadFormat.MP3)} className={`flex-1 py-3 rounded-xl text-xs font-black ${format === DownloadFormat.MP3 ? 'bg-slate-800 text-white shadow-xl' : 'text-slate-600'}`}>MP3</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">畫質/音質</label>
                    <div className="relative">
                      <select className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-3.5 px-4 text-xs font-bold text-white appearance-none cursor-pointer" value={quality} onChange={(e) => setQuality(e.target.value)}>
                        {format === DownloadFormat.MP4 ? (
                          <>
                            <option value={VideoQuality.P1080}>1080p Full HD</option>
                            <option value={VideoQuality.P720}>720p HD</option>
                            <option value={VideoQuality.P4K}>4K Ultra HD</option>
                          </>
                        ) : (
                          <>
                            <option value={AudioQuality.HIGH}>320kbps (極高)</option>
                            <option value={AudioQuality.MEDIUM}>192kbps (平衡)</option>
                          </>
                        )}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    </div>
                  </div>
                </div>
                <button onClick={handleAddTask} className="w-full bg-white hover:bg-slate-200 text-slate-950 font-black py-5 rounded-2xl transition-all shadow-2xl flex items-center justify-center gap-3 text-lg">
                  <Download className="w-6 h-6" /> 確認下載
                </button>
              </div>
            </div>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="space-y-6 pt-6">
            <h4 className="text-xl font-black text-white flex items-center gap-3"><div className="w-1.5 h-6 bg-red-600 rounded-full"></div> 任務清單</h4>
            <div className="space-y-4">
              {tasks.map(task => (
                <div key={task.id} className="glass-card rounded-3xl p-6 flex items-center gap-6">
                  <div className="p-4 rounded-2xl bg-slate-800/50 text-red-500">
                    {task.format === DownloadFormat.MP4 ? <Video className="w-6 h-6" /> : <Music className="w-6 h-6" />}
                  </div>
                  <div className="flex-grow min-w-0">
                    <h5 className="font-bold text-white truncate text-base">{task.title}</h5>
                    <p className="text-[10px] font-black text-slate-500 uppercase mt-1">{task.quality} • {task.format}</p>
                    {task.status === 'downloading' && (
                      <div className="h-1.5 w-full bg-slate-900 rounded-full mt-4 overflow-hidden">
                        <div className="h-full bg-red-600 w-full animate-shimmer" />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {task.status === 'completed' ? <CheckCircle2 className="w-7 h-7 text-emerald-500" /> : 
                     task.status === 'failed' ? <AlertCircle className="w-7 h-7 text-red-500" /> : 
                     <Loader2 className="w-7 h-7 animate-spin text-slate-700" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showSetupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-[#0f172a] border border-white/10 w-full max-w-xl rounded-[2.5rem] p-10 relative">
            <button onClick={() => setShowSetupModal(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X className="w-7 h-7" /></button>
            <div className="space-y-8">
              <h3 className="text-3xl font-black text-white">啟動本地引擎</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-slate-400 font-bold text-sm">1. 環境準備</p>
                  <code className="block bg-black p-4 rounded-xl text-red-500 font-mono text-xs border border-white/5">pip install flask flask-cors yt-dlp</code>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><p className="text-slate-400 font-bold text-sm">2. 運行腳本</p><button onClick={copyScript} className="text-[10px] bg-white/5 px-3 py-1 rounded-lg border border-white/5">複製</button></div>
                  <div className="max-h-48 overflow-y-auto bg-black p-4 rounded-xl border border-white/5"><pre className="text-[10px] text-slate-600 font-mono">{pythonScript}</pre></div>
                </div>
              </div>
              <button onClick={() => setShowSetupModal(false)} className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-900/20">完成啟動</button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-5">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl ${notification.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200' : 'bg-amber-500/20 border-amber-500/50 text-amber-200'}`}>
            <Zap className="w-5 h-5 fill-current" /> <span className="font-bold text-sm">{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
