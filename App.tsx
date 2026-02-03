
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
  Settings,
  RefreshCw
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

  // 核心改動：針對 YouTube 最近的 403 阻擋機制進行腳本升級
  const pythonScript = `
import os
import yt_dlp
import datetime
import traceback
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DOWNLOAD_DIR = 'tube_downloads'
if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

# 解決 403 Forbidden 的關鍵配置
# 使用 ios 或是 android 客戶端參數通常能繞過網頁版的 SABR 阻擋
COMMON_YDL_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'nocheckcertificate': True,
    'referer': 'https://www.youtube.com/',
    'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'extractor_args': {
        'youtube': {
            'player_client': ['ios', 'web'],
            'skip': ['dash', 'hls']
        }
    },
    'http_headers': {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Mode': 'navigate',
    }
}

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "running", "engine": "yt-dlp", "version": yt_dlp.version.__version__})

@app.route('/info', methods=['POST'])
def get_info():
    try:
        data = request.json
        video_url = data.get('url')
        if not video_url:
            return jsonify({"error": "請提供網址"}), 400
            
        ydl_opts = {**COMMON_YDL_OPTS, 'noplaylist': True}
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
        print(f"解析錯誤: {str(e)}")
        return jsonify({"error": f"解析失敗: {str(e)}"}), 500

@app.route('/download', methods=['POST'])
def download():
    try:
        data = request.json
        video_url = data.get('url')
        fmt = data.get('format')
        quality = data.get('quality')
        height = quality.replace('p', '') if 'p' in quality else '720'
        
        ydl_opts = {
            **COMMON_YDL_OPTS,
            'outtmpl': f'{DOWNLOAD_DIR}/%(title)s.%(ext)s',
            'noplaylist': True,
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
            # 優先下載合併後的 mp4 或最佳畫質
            ydl_opts['format'] = f'bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            filename = ydl.prepare_filename(info)
            if fmt == 'MP3':
                filename = os.path.splitext(filename)[0] + '.mp3'
            
            if os.path.exists(filename):
                return send_file(filename, as_attachment=True)
            else:
                return jsonify({"error": "檔案生成失敗，請檢查系統是否安裝 FFmpeg"}), 500
                
    except Exception as e:
        print(f"下載錯誤: {str(e)}")
        return jsonify({"error": f"下載失敗 (403 Forbidden 或 YouTube 阻擋): {str(e)}"}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("TubeFlow Engine V3 (Anti-403) 啟動成功！")
    print("已加入 iOS 客戶端偽裝以繞過最近的 YouTube 下載限制。")
    print("若仍發生 403，請執行: pip install -U yt-dlp")
    print("API URL: http://localhost:5000")
    print("=" * 50)
    app.run(port=5000)
  `.trim();

  const checkBackend = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
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
      setError("請貼入網址後點擊解析");
      return;
    }
    setError(null);
    setIsFetching(true);
    setMetadata(null);
    try {
      const data = await fetchVideoMetadata(url);
      setMetadata(data);
      setNotification({ message: "影片資訊已同步", type: 'success' });
    } catch (err: any) {
      setError(err.message || "發生未知錯誤");
    } finally {
      setIsFetching(false);
    }
  };

  const startRealDownload = async (task: DownloadTask) => {
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

      if (!response.ok) {
         const errData = await response.json().catch(() => ({}));
         throw new Error(errData.error || "下載引擎回報錯誤 (HTTP 403 Forbidden)");
      }

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
      setNotification({ message: "下載成功，請檢查下載夾", type: 'success' });
    } catch (err: any) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed' } : t));
      setNotification({ message: err.message, type: 'warning' });
      setError(`下載失敗: ${err.message}. 請確認 Python 腳本已更新至 V3 版本且已升級 yt-dlp。`);
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
    setNotification({ message: "V3 腳本已複製", type: 'success' });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-20 selection:bg-red-500/30">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/60 backdrop-blur-xl px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-red-600 to-red-800 p-2 rounded-xl shadow-lg shadow-red-900/20">
              <Youtube className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-white">TubeFlow <span className="text-red-600">Pure</span></h1>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black border transition-all ${
              isBackendConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isBackendConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`}></div>
              {isBackendConnected ? '本地引擎：運作中' : '本地引擎：未偵測'}
            </div>
            <button onClick={() => setShowSetupModal(true)} className="p-2 text-slate-500 hover:text-white transition-all bg-white/5 rounded-xl border border-white/5 hover:border-white/20">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-16 space-y-12">
        <section className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
          <div className="space-y-4">
            <h2 className="text-6xl md:text-8xl font-black text-white leading-tight tracking-tight">
              突破限制。 <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-orange-500 to-amber-500">無限下載。</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg font-medium opacity-80 leading-relaxed">
              您的電腦就是最強大的伺服器。V3 版本加入了 Anti-403 機制，專為應對 YouTube 最近的存取限制所設計。
            </p>
          </div>

          <div className="relative max-w-2xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-600 rounded-3xl blur opacity-10 group-focus-within:opacity-40 transition duration-500"></div>
            <div className="relative flex flex-col md:flex-row gap-3 p-1">
              <div className="relative flex-grow">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" />
                <input 
                  type="text"
                  placeholder="在此貼上 YouTube 網址..."
                  className="w-full bg-slate-900/40 border border-white/10 rounded-2xl py-5 pl-14 pr-6 focus:outline-none focus:border-red-600/50 transition-all text-white text-lg font-bold backdrop-blur-md"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if(error) setError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchMetadata()}
                />
              </div>
              <button 
                onClick={handleFetchMetadata}
                disabled={isFetching}
                className="bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-black px-12 py-5 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl text-lg group active:scale-95"
              >
                {isFetching ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6 fill-current group-hover:scale-110" />}
                解析
              </button>
            </div>
            
            {error && (
              <div className="mt-6 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-4 text-left animate-in zoom-in-95 duration-300">
                <div className="bg-red-500/20 p-2 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                </div>
                <div className="flex-grow">
                  <p className="text-red-500 font-black text-xs uppercase tracking-wider mb-1">下載/解析異常</p>
                  <p className="text-red-100/90 text-sm font-medium leading-relaxed">{error}</p>
                  <div className="mt-4 p-3 bg-black/40 rounded-xl border border-white/5 space-y-2">
                    <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest">解決方案：</p>
                    <ul className="text-xs text-red-200/70 list-disc list-inside space-y-1 font-medium">
                      <li>點擊右上方 <Settings className="inline w-3 h-3" /> 複製最新的 <b>V3 Python 腳本</b> 並重新執行</li>
                      <li>在終端機執行 <b>pip install -U yt-dlp</b> 以更新核心元件</li>
                      <li>檢查是否已安裝 <b>FFmpeg</b> 以支援音訊合併</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {metadata && (
          <div className="glass-card rounded-[3.5rem] p-10 animate-in fade-in zoom-in-95 duration-700 border-white/5 relative overflow-hidden group shadow-2xl">
            <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-red-600/5 blur-[150px] -mr-40 -mt-40 transition-opacity opacity-50 group-hover:opacity-100"></div>
            <div className="flex flex-col md:flex-row gap-12 relative z-10">
              <div className="w-full md:w-5/12 aspect-video rounded-3xl overflow-hidden border border-white/10 group/img shadow-2xl">
                <img src={metadata.thumbnail} className="w-full h-full object-cover transition-transform duration-1000 group-hover/img:scale-110" alt="Thumb" />
                <div className="absolute bottom-4 right-4 bg-black/90 px-4 py-2 rounded-2xl text-[10px] font-black text-white backdrop-blur-md border border-white/10">{metadata.duration}</div>
              </div>
              <div className="flex-grow space-y-8 flex flex-col justify-center">
                <div>
                  <h3 className="text-3xl font-black text-white mb-4 line-clamp-2 leading-tight tracking-tight">{metadata.title}</h3>
                  <div className="flex items-center gap-4 text-slate-500 font-bold text-sm">
                    <div className="flex items-center gap-2 bg-slate-900/50 px-4 py-2 rounded-2xl border border-white/5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                      <span className="text-slate-300">{metadata.author}</span>
                    </div>
                    <span className="text-slate-600 underline underline-offset-8 decoration-slate-800">{metadata.views} 次觀看</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-600 uppercase ml-1 tracking-[0.3em] block">媒體格式</label>
                    <div className="flex bg-slate-950/40 p-1.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                      <button onClick={() => setFormat(DownloadFormat.MP4)} className={`flex-1 py-4 rounded-xl text-xs font-black transition-all ${format === DownloadFormat.MP4 ? 'bg-slate-800 text-white shadow-2xl scale-100' : 'text-slate-600 hover:text-slate-400'}`}>MP4 影片</button>
                      <button onClick={() => setFormat(DownloadFormat.MP3)} className={`flex-1 py-4 rounded-xl text-xs font-black transition-all ${format === DownloadFormat.MP3 ? 'bg-slate-800 text-white shadow-2xl scale-100' : 'text-slate-600 hover:text-slate-400'}`}>MP3 音訊</button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-600 uppercase ml-1 tracking-[0.3em] block">檔案品質</label>
                    <div className="relative group/sel">
                      <select 
                        className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-4.5 px-6 text-xs font-bold text-white appearance-none cursor-pointer focus:outline-none focus:border-red-500/50 backdrop-blur-sm transition-all hover:bg-slate-900/60" 
                        value={quality} 
                        onChange={(e) => setQuality(e.target.value)}
                      >
                        {format === DownloadFormat.MP4 ? (
                          <>
                            <option value={VideoQuality.P1080}>1080p FHD</option>
                            <option value={VideoQuality.P720}>720p HD</option>
                            <option value={VideoQuality.P4K}>4K Ultra HD</option>
                            <option value={VideoQuality.P360}>360p Standard</option>
                          </>
                        ) : (
                          <>
                            <option value={AudioQuality.HIGH}>320kbps (極高)</option>
                            <option value={AudioQuality.MEDIUM}>192kbps (標準)</option>
                            <option value={AudioQuality.LOW}>128kbps (省空間)</option>
                          </>
                        )}
                      </select>
                      <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none group-hover/sel:text-red-500 transition-colors" />
                    </div>
                  </div>
                </div>
                <button 
                  onClick={handleAddTask} 
                  className="w-full bg-white hover:bg-red-600 hover:text-white text-slate-950 font-black py-6 rounded-[2rem] transition-all shadow-2xl flex items-center justify-center gap-4 text-xl active:scale-[0.97] group/btn"
                >
                  <Download className="w-7 h-7 transition-transform group-hover/btn:translate-y-1" /> 確認下載 (V3 引擎)
                </button>
              </div>
            </div>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="space-y-8 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-black text-white flex items-center gap-4">
                <div className="w-1.5 h-8 bg-red-600 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.6)]"></div> 
                當前任務單
              </h4>
            </div>
            <div className="space-y-5">
              {tasks.map(task => (
                <div key={task.id} className="glass-card rounded-[2.5rem] p-8 flex items-center gap-10 border-white/5 hover:border-white/10 transition-all shadow-xl hover:shadow-2xl">
                  <div className={`p-5 rounded-[1.5rem] ${task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-900/50 text-red-500'} border border-white/5 shadow-inner`}>
                    {task.format === DownloadFormat.MP4 ? <Video className="w-8 h-8" /> : <Music className="w-8 h-8" />}
                  </div>
                  <div className="flex-grow min-w-0 text-left">
                    <h5 className="font-bold text-white truncate text-lg mb-2">{task.title}</h5>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] bg-white/5 px-3 py-1 rounded-lg">{task.quality}</span>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] bg-white/5 px-3 py-1 rounded-lg">{task.format}</span>
                      {task.status === 'downloading' && (
                        <span className="flex items-center gap-2 text-[10px] font-black text-red-500 animate-pulse ml-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_red]"></div> 
                          伺服器通訊中...
                        </span>
                      )}
                    </div>
                    {task.status === 'downloading' && (
                      <div className="h-2 w-full bg-slate-950 rounded-full mt-5 overflow-hidden border border-white/5 shadow-inner">
                        <div className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-red-600 w-full animate-shimmer" />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-5">
                    {task.status === 'completed' ? (
                      <div className="flex items-center gap-3 text-emerald-500 bg-emerald-500/10 px-6 py-3 rounded-2xl border border-emerald-500/20 font-black text-sm shadow-lg shadow-emerald-900/10">
                        完成 <CheckCircle2 className="w-6 h-6" />
                      </div>
                    ) : task.status === 'failed' ? (
                      <button 
                        onClick={() => startRealDownload(task)}
                        className="flex items-center gap-3 text-red-500 bg-red-500/10 px-6 py-3 rounded-2xl border border-red-500/20 font-black text-sm hover:bg-red-500/20 transition-all active:scale-95"
                      >
                        重試 <RefreshCw className="w-6 h-6" />
                      </button>
                    ) : (
                      <div className="p-4 bg-slate-950/60 rounded-2xl shadow-inner border border-white/5">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showSetupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="bg-[#0f172a] border border-white/10 w-full max-w-3xl rounded-[3.5rem] p-12 relative shadow-[0_0_120px_rgba(0,0,0,0.8)] overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2.5 bg-gradient-to-r from-red-600 via-orange-500 to-red-600"></div>
            <button onClick={() => setShowSetupModal(false)} className="absolute top-12 right-12 text-slate-600 hover:text-white transition-all transform hover:rotate-90"><X className="w-10 h-10" /></button>
            <div className="space-y-12 text-left">
              <div className="space-y-4">
                <h3 className="text-5xl font-black text-white tracking-tighter">
                  防 403 引擎 <span className="text-red-600 underline underline-offset-8 decoration-8">V3 版本</span>
                </h3>
                <p className="text-slate-500 font-medium text-xl leading-relaxed max-w-xl">
                  YouTube 最近加強了存取限制，請務必更新 Python 腳本並升級 yt-dlp 模組以保持穩定下載。
                </p>
              </div>
              <div className="space-y-10">
                <div className="space-y-5">
                  <p className="text-white font-black text-base flex items-center gap-4"><span className="w-8 h-8 rounded-[1rem] bg-red-600 text-white flex items-center justify-center text-[14px] shadow-xl shadow-red-900/40">1</span> 解決 403 封鎖 (必要步驟)</p>
                  <div className="relative group/code">
                    <code className="block bg-black/60 p-6 rounded-2xl text-red-500 font-mono text-sm border border-white/5 select-all leading-relaxed shadow-inner">
                      pip install -U flask flask-cors yt-dlp
                    </code>
                    <p className="mt-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest px-2 italic">※ 如果下載失敗且顯示 403，請優先執行此指令更新 yt-dlp</p>
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center justify-between pr-4">
                    <p className="text-white font-black text-base flex items-center gap-4"><span className="w-8 h-8 rounded-[1rem] bg-red-600 text-white flex items-center justify-center text-[14px] shadow-xl shadow-red-900/40">2</span> 更新 Python 驅動代碼</p>
                    <button onClick={copyScript} className="text-[12px] font-black text-white hover:text-white bg-red-600 hover:bg-red-500 px-6 py-2.5 rounded-2xl shadow-xl shadow-red-900/40 flex items-center gap-3 transition-all active:scale-95 group/copy">
                      <Copy className="w-4 h-4 transition-transform group-hover/copy:scale-110" /> 點擊複製 V3 完整代碼
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto bg-black/80 p-8 rounded-[2rem] border border-white/10 custom-scrollbar shadow-inner">
                    <pre className="text-[11px] text-slate-500 font-mono leading-relaxed select-all whitespace-pre-wrap">{pythonScript}</pre>
                  </div>
                </div>
              </div>
              <div className="pt-6">
                <button onClick={() => setShowSetupModal(false)} className="w-full bg-white hover:bg-slate-100 text-slate-950 font-black py-6 rounded-[2rem] shadow-[0_20px_40px_rgba(255,255,255,0.05)] transition-all active:scale-[0.98] text-xl">已重啟 V3 引擎，返回主頁</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-10 duration-700">
          <div className={`px-10 py-6 rounded-[2.5rem] shadow-[0_30px_70px_rgba(0,0,0,0.6)] border flex items-center gap-5 backdrop-blur-3xl transition-all ${notification.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-50 shadow-emerald-500/10' : 'bg-red-500/20 border-red-500/40 text-red-50 shadow-red-500/10'}`}>
            <div className={`p-2.5 rounded-xl ${notification.type === 'success' ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}>
              <Zap className={`w-6 h-6 ${notification.type === 'success' ? 'text-emerald-400' : 'text-red-400'} fill-current`} /> 
            </div>
            <span className="font-black text-sm tracking-widest uppercase">{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
