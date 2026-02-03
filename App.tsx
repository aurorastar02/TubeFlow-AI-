
import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Youtube, 
  Music, 
  Video, 
  History, 
  Search, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ChevronDown,
  X,
  Terminal,
  Copy,
  Cpu,
  RefreshCw,
  Zap,
  ShieldCheck,
  Settings
} from 'lucide-react';
import { 
  DownloadFormat, 
  AudioQuality, 
  VideoQuality, 
  VideoMetadata, 
  DownloadTask 
} from './types';
import { fetchVideoMetadata } from './services/geminiService';

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

  // 更新後的 Python 腳本：包含 /info 路由來取代 Gemini
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
    print("TubeFlow 本地引擎已就緒！(無須 Gemini API)")
    print("API 地址: http://localhost:5000")
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
      setError("請先貼入有效的 YouTube 網址");
      return;
    }
    if (!isBackendConnected) {
      setError("請先啟動本地 Python 下載引擎");
      setShowSetupModal(true);
      return;
    }
    setError(null);
    setIsFetching(true);
    setMetadata(null);
    try {
      const data = await fetchVideoMetadata(url);
      setMetadata(data);
    } catch (err) {
      setError("連線本地引擎失敗，請檢查 Python 視窗。");
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

      if (!response.ok) throw new Error("Backend processing failed");

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
      setNotification({ message: "下載完成！檔案已成功儲存。", type: 'success' });
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed' } : t));
      setNotification({ message: "下載中斷，請確認 Python 視窗。", type: 'warning' });
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
            <div className="bg-gradient-to-br from-red-500 to-red-700 p-2 rounded-xl shadow-lg shadow-red-500/20">
              <Youtube className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-white">TubeFlow <span className="text-red-500">PRO</span></h1>
          </div>

          <div className="flex items-center gap-4">
            <div 
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black transition-all border ${
                isBackendConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${isBackendConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`}></div>
              {isBackendConnected ? '本地引擎：已就緒' : '本地引擎：未連線'}
            </div>
            <button 
              onClick={() => setShowSetupModal(true)}
              className="p-2 text-slate-500 hover:text-white transition-colors bg-white/5 rounded-xl border border-white/5"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-16 space-y-12">
        <section className="text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-5xl md:text-7xl font-black text-white leading-tight tracking-tight">
              純淨下載。 <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-amber-500">不需 AI 即可解析。</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg font-medium">
              不再依賴 Gemini API。透過本地端強大的 yt-dlp 核心，提供最穩定、最準確的 YouTube 解析體驗。
            </p>
          </div>

          <div className="relative max-w-2xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative flex flex-col md:flex-row gap-3">
              <div className="relative flex-grow">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" />
                <input 
                  type="text"
                  placeholder="請貼上 YouTube 網址..."
                  className="w-full bg-slate-900/50 border border-white/10 rounded-2xl py-5 pl-14 pr-6 focus:outline-none focus:border-red-500/50 transition-all text-white text-lg font-bold placeholder:text-slate-600 backdrop-blur-md"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchMetadata()}
                />
              </div>
              <button 
                onClick={handleFetchMetadata}
                disabled={isFetching}
                className="bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-black px-10 py-5 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl shadow-red-900/40 text-lg group"
              >
                {isFetching ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6 fill-current group-hover:scale-125 transition-transform" />}
                開始解析
              </button>
            </div>
            {error && (
              <div className="absolute -bottom-8 left-2 flex items-center gap-2 text-red-400 text-sm font-bold animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}
          </div>
        </section>

        {metadata && (
          <div className="glass-card rounded-[2.5rem] p-8 md:p-10 animate-in fade-in zoom-in-95 duration-500 border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/5 blur-[100px] -mr-40 -mt-40"></div>
            
            <div className="flex flex-col md:flex-row gap-10 relative z-10">
              <div className="w-full md:w-5/12 aspect-video rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative group">
                <img src={metadata.thumbnail} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Thumbnail" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-md px-3 py-1 rounded-xl text-xs font-black text-white border border-white/10">
                  {metadata.duration}
                </div>
              </div>

              <div className="flex-grow space-y-6">
                <div>
                  <h3 className="text-2xl md:text-3xl font-black text-white mb-2 leading-tight">{metadata.title}</h3>
                  <div className="flex items-center gap-3 text-slate-500 font-bold text-sm">
                    <span className="bg-white/5 px-2 py-1 rounded-lg text-red-500">REAL-TIME</span>
                    {metadata.author} • {metadata.views}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">選擇格式</label>
                    <div className="flex bg-slate-950/50 p-1 rounded-2xl border border-white/5">
                      <button 
                        onClick={() => setFormat(DownloadFormat.MP4)}
                        className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${format === DownloadFormat.MP4 ? 'bg-slate-800 text-white shadow-xl border border-white/5' : 'text-slate-600 hover:text-slate-400'}`}
                      >VIDEO (MP4)</button>
                      <button 
                        onClick={() => setFormat(DownloadFormat.MP3)}
                        className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${format === DownloadFormat.MP3 ? 'bg-slate-800 text-white shadow-xl border border-white/5' : 'text-slate-600 hover:text-slate-400'}`}
                      >AUDIO (MP3)</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">品質</label>
                    <div className="relative">
                      <select 
                        className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-3.5 px-4 text-xs font-bold text-white focus:outline-none focus:border-red-500/50 transition-all appearance-none cursor-pointer"
                        value={quality}
                        onChange={(e) => setQuality(e.target.value)}
                      >
                        {format === DownloadFormat.MP4 ? (
                          <>
                            <option value={VideoQuality.P1080}>1080p Full HD</option>
                            <option value={VideoQuality.P720}>720p HD</option>
                            <option value={VideoQuality.P4K}>4K Ultra HD</option>
                          </>
                        ) : (
                          <>
                            <option value={AudioQuality.HIGH}>320kbps (極致)</option>
                            <option value={AudioQuality.MEDIUM}>192kbps (標準)</option>
                          </>
                        )}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleAddTask}
                  className="w-full bg-white hover:bg-slate-200 text-slate-950 font-black py-5 rounded-2xl transition-all shadow-2xl flex items-center justify-center gap-3 text-lg active:scale-95"
                >
                  <Download className="w-6 h-6" />
                  確認下載
                </button>
              </div>
            </div>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="space-y-6 pt-6">
            <h4 className="text-xl font-black text-white flex items-center gap-3">下載任務</h4>
            <div className="space-y-4">
              {tasks.map(task => (
                <div key={task.id} className="glass-card rounded-3xl p-6 flex items-center gap-6 border-white/5">
                  <div className="p-4 rounded-2xl bg-slate-800/50 text-red-500">
                    {task.format === DownloadFormat.MP4 ? <Video className="w-6 h-6" /> : <Music className="w-6 h-6" />}
                  </div>
                  <div className="flex-grow min-w-0">
                    <h5 className="font-bold text-white truncate text-base">{task.title}</h5>
                    <p className="text-[10px] font-black text-slate-500 uppercase mt-1">{task.quality} • {task.format}</p>
                    {task.status === 'downloading' && (
                      <div className="h-1 w-full bg-slate-900 rounded-full mt-4 overflow-hidden">
                        <div className="h-full bg-red-600 animate-pulse w-full" />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    ) : task.status === 'failed' ? (
                      <AlertCircle className="w-6 h-6 text-red-500" />
                    ) : (
                      <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showSetupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 w-full max-w-2xl rounded-[3rem] p-10 relative shadow-2xl">
            <button onClick={() => setShowSetupModal(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X className="w-8 h-8" /></button>
            <div className="space-y-8">
              <h3 className="text-3xl font-black text-white">啟動本地引擎 (無須 API)</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-white font-bold">1. 安裝環境</p>
                  <code className="block bg-black/50 p-4 rounded-xl text-red-400 font-mono text-xs border border-white/5">
                    pip install flask flask-cors yt-dlp
                  </code>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-bold">2. 執行腳本</p>
                    <button onClick={copyScript} className="text-xs text-slate-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2">
                      <Copy className="w-3 h-3" /> 複製
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-black/50 p-4 rounded-xl border border-white/5">
                    <pre className="text-[10px] text-slate-500 font-mono">{pythonScript}</pre>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowSetupModal(false)} className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl">我已啟動腳本</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
