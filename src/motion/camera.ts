import type { MotionFrame, MotionMode, Settings } from '../core/types';
export type CameraStatus = 'off' | 'requesting' | 'loading' | 'ready' | 'error';
export class CameraManager {
  stream: MediaStream | null = null; video = document.createElement('video');
  status: CameraStatus = 'off'; message = ''; mode: MotionMode = 'hand';
  worker: Worker | null = null; busy = false; frameTime = 0; nextFrameTime = 0; lastVideoTime = -1; raf = 0; videoCallback = 0; watchdog = 0; generation = 0;
  settings: Settings; onStatus = () => {}; onFrame = (_f: MotionFrame) => {};
  private frameListeners = new Set<(frame: MotionFrame) => void>();
  hasResult = false;
  constructor(settings: Settings) { this.settings = settings; this.video.muted = true; this.video.playsInline = true; }
  subscribeFrame(listener: (frame: MotionFrame) => void) {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }
  setStatus(status: CameraStatus, message = '') { this.status = status; this.message = message; this.onStatus(); }
  async start() {
    this.stop(); const token = this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { this.setStatus('error', '카메라는 HTTPS 또는 localhost에서 사용할 수 있어요.'); return; }
    this.setStatus('requesting', '브라우저에서 카메라를 허용해주세요.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: this.settings.resolution }, height: { ideal: this.settings.resolution * .75 }, frameRate: { ideal: 60, max: 60 }, ...(this.settings.deviceId ? { deviceId: { exact: this.settings.deviceId } } : {}) } });
      if (token !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.video.srcObject = stream;
      stream.getVideoTracks()[0].onended = () => this.fail('카메라 연결이 끊어졌어요. 다시 연결해주세요.');
      await this.video.play();
      if (token !== this.generation) return;
      this.loadWorker();
    } catch (error) {
      if (token !== this.generation) return;
      const name = (error as DOMException).name;
      this.fail(name === 'NotAllowedError' ? '카메라 권한이 꺼져 있어요. 주소창의 사이트 설정에서 허용한 뒤 다시 시도해주세요.' : name === 'NotFoundError' || name === 'OverconstrainedError' ? '선택한 카메라를 찾을 수 없어요. 카메라 연결과 설정을 확인해주세요.' : '카메라를 열 수 없어요. 다른 앱에서 사용 중인지 확인해주세요.');
    }
  }
  loadWorker() {
    this.cancelLoop(); clearTimeout(this.watchdog); this.worker?.terminate(); this.busy = false; this.hasResult = false; this.lastVideoTime = -1; this.nextFrameTime = 0;
    this.setStatus('loading', `${this.mode === 'tetris' ? '손과 몸' : this.mode === 'hand' ? '손' : '몸'} 인식 모델을 준비하고 있어요.`);
    const worker = new Worker(`${import.meta.env.BASE_URL}vision.worker.js`); this.worker = worker;
    this.watchdog = window.setTimeout(() => this.fail('인식 모델을 불러오지 못했어요. npm run setup:models 실행 후 다시 시도해주세요.'), 45000);
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker) return;
      if (data.type === 'ready') { clearTimeout(this.watchdog); this.setStatus('ready'); this.loop(); }
      if (data.type === 'error') this.fail('인식 모델을 실행하지 못했어요. 모델 파일과 브라우저를 확인하고 다시 시도해주세요.');
      if (data.type === 'result') {
        this.busy = false; this.hasResult = true; clearTimeout(this.watchdog);
        // Gameplay consumes the result synchronously; React preview rendering
        // must not add another render/effect cycle to a jump command.
        for (const listener of this.frameListeners) {
          if (worker !== this.worker || this.status !== 'ready') return;
          listener(data);
        }
        if (worker !== this.worker || this.status !== 'ready') return;
        this.onFrame(data);
        // Inference can finish just after a video/RAF callback. Reuse the
        // newly available slot immediately instead of waiting another tick.
        if (worker === this.worker) this.captureFrame();
      }
    };
    worker.onerror = () => { if (worker === this.worker) this.fail('인식 작업을 실행하지 못했어요. 최신 Chrome에서 다시 시도해주세요.'); };
    worker.postMessage({ type: 'init', mode: this.mode, base: new URL(import.meta.env.BASE_URL, location.origin).href });
  }
  setMode(mode: MotionMode) { if (mode === this.mode) return; this.mode = mode; if (this.stream && this.status !== 'requesting') this.loadWorker(); }
  cancelLoop() {
    cancelAnimationFrame(this.raf);this.raf = 0;
    if(this.videoCallback)this.video.cancelVideoFrameCallback?.(this.videoCallback);
    this.videoCallback = 0;
  }
  loop = () => {
    if (this.status !== 'ready') return;
    // A detached video may stop issuing presentation callbacks (even while
    // currentTime advances). Retain one RAF fallback so tracking cannot stall.
    this.raf = requestAnimationFrame(this.loop);
    if(!this.videoCallback&&this.video.requestVideoFrameCallback)this.videoCallback = this.video.requestVideoFrameCallback(this.cameraFrame);
    this.captureFrame();
  };
  cameraFrame = () => {
    this.videoCallback=0;
    if(this.status!=='ready')return;
    this.videoCallback=this.video.requestVideoFrameCallback(this.cameraFrame);
    this.captureFrame();
  };
  captureFrame() {
    // Both clocks sample the newest decoded frame. Busy frames are skipped,
    // never queued behind an older inference.
    const time = performance.now();
    if (this.status !== 'ready' || !this.worker || document.hidden || this.busy || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime || time + 2 < this.nextFrameTime) return;
    this.busy = true; this.frameTime = time; this.lastVideoTime = this.video.currentTime;
    const interval = 1000 / this.settings.frequency;
    // Keep the deadline anchored so 30 Hz video does not turn a 20 Hz request
    // into 15 Hz by rounding every interval to two camera frames.
    this.nextFrameTime = Math.max(this.nextFrameTime + interval, time + interval / 4);
    const worker = this.worker;
    this.watchdog = window.setTimeout(() => this.fail('인식 응답이 멈췄어요. 카메라를 다시 연결해주세요.'), 6000);
    const width = this.video.videoWidth, height = this.video.videoHeight;
    const resize = width > 640 ? { resizeWidth: 640, resizeHeight: Math.max(1,Math.round(height * 640 / width)), resizeQuality: 'low' as const } : undefined;
    createImageBitmap(this.video, resize).then(bitmap => {
      if (worker !== this.worker || this.status !== 'ready') { bitmap.close(); return; }
      try { worker!.postMessage({ type: 'frame', bitmap, time, width, height }, [bitmap]); }
      catch (error) { bitmap.close(); throw error; }
    }).catch(() => {
      if (worker === this.worker && this.status === 'ready') this.fail('카메라 영상을 읽지 못했어요. 다시 연결해주세요.');
    });
  }
  fail(message: string) { this.stop(); this.setStatus('error', message); }
  stop() {
    this.generation++; this.cancelLoop(); clearTimeout(this.watchdog); this.worker?.terminate(); this.worker = null;
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = null;
    this.video.pause(); this.video.srcObject = null; this.busy = false; this.hasResult = false; this.setStatus('off');
  }
}
