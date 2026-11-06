/**
 * Direct Gemini Live native-audio WebSocket client.
 * Ephemeral credentials are provisioned by the Next.js backend (never the long-lived Gemini API key).
 * Audio is streamed as 16 kHz PCM and played from 24 kHz native PCM; there is NO browser TTS/STT.
 */
export type LiveBoot = {
  liveToken: string;
  liveEndpoint: string;
  liveSetup: Record<string, unknown>;
};
export type LiveCallbacks = {
  onModelText: (text: string) => void;
  onUserText: (text: string) => void;
  onSpeaking: (speaking: boolean) => void;
  onStatus: (status: string) => void;
  onError: (error: string) => void;
};

type ServerContent = {
  modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string }; text?: string }[] };
  outputTranscription?: { text?: string };
  inputTranscription?: { text?: string };
  turnComplete?: boolean;
  interrupted?: boolean;
};
type LiveWireMessage = {
  setupComplete?: object;
  serverContent?: ServerContent;
  goAway?: object;
};

function pcm16ToAudioBuffer(ctx: AudioContext, base64: string): AudioBuffer {
  const binary = atob(base64);
  const len = Math.floor(binary.length / 2);
  const buf = ctx.createBuffer(1, len, 24_000);
  const float = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const u16 = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
    const signed = u16 > 32767 ? u16 - 65536 : u16;
    float[i] = signed / 32768;
  }
  return buf;
}
function toBase64(bytes: Uint8Array): string {
  // Worklet frames are 1280 bytes each. btoa on the fixed-size chunk is safe.
  let chunk = "";
  for (let i = 0; i < bytes.byteLength; i++) chunk += String.fromCharCode(bytes[i]);
  return btoa(chunk);
}

export class GeminiLiveAudio {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private socket: WebSocket | null = null;
  private micNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private silent: GainNode | null = null;
  private gain: GainNode | null = null;
  private nodes = new Set<AudioBufferSourceNode>();
  private playhead = 0;
  private ready = false;
  private closed = false;
  private micEnabled = true;
  private soundEnabled = true;
  private micAvailable = true;

  constructor(private callbacks: LiveCallbacks) {}

  hasMicrophone(): boolean { return this.micAvailable; }
  isConnected(): boolean { return this.ready && !this.closed && this.socket?.readyState === WebSocket.OPEN; }

  /** Call from a user gesture: opens the audio device before network waiting. */
  async prepare(): Promise<void> {
    if (this.closed) throw Error("전화가 종료됐어요.");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw Error("보안 연결(HTTPS) 환경에서만 AI 음성 통화를 사용할 수 있어요.");
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    await ctx.resume();
    this.gain = ctx.createGain();
    this.gain.connect(ctx.destination);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
      await ctx.audioWorklet.addModule("/audio/live-input-processor.js");
      if (this.closed) return;
      this.source = ctx.createMediaStreamSource(this.stream);
      this.micNode = new AudioWorkletNode(ctx, "mikki-live-input");
      this.silent = ctx.createGain();
      this.silent.gain.value = 0;
      this.source.connect(this.micNode);
      this.micNode.connect(this.silent);
      this.silent.connect(ctx.destination);
      this.micNode.port.onmessage = event => {
        const ws = this.socket;
        if (!this.ready || !this.micEnabled || !ws || ws.readyState !== WebSocket.OPEN ||
          ws.bufferedAmount > 250_000 || !(event.data instanceof ArrayBuffer)) return;
        ws.send(JSON.stringify({
          realtimeInput: {
            audio: { mimeType: "audio/pcm;rate=16000", data: toBase64(new Uint8Array(event.data)) },
          },
        }));
      };
    } catch (e) {
      // Text messages still elicit Gemini native audio. No browser speech synthesis is used.
      this.micAvailable = false;
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.callbacks.onStatus("마이크를 열지 못했어요. 음성 대신 글로 말할 수 있어요.");
      if (e instanceof Error) console.warn("Microphone unavailable:", e.name);
    }
  }

  async connect(boot: LiveBoot): Promise<void> {
    if (!this.ctx || this.closed) throw Error("오디오 장치를 초기화할 수 없어요.");
    if (!boot.liveToken || !boot.liveEndpoint.startsWith("wss://generativelanguage.googleapis.com/"))
      throw Error("AI 음성 연결 정보가 유효하지 않아요.");
    const ws = new WebSocket(boot.liveEndpoint + "?access_token=" + encodeURIComponent(boot.liveToken));
    // Gemini can send JSON as a binary WebSocket frame.
    ws.binaryType = "arraybuffer";
    const decoder = new TextDecoder();
    this.socket = ws;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(Error("AI 음성 연결 시간이 초과됐어요.")), 12_000);
      const cleanup = () => window.clearTimeout(timeout);
      ws.onopen = () => {
        if (this.closed) return;
        try { ws.send(JSON.stringify({ setup: boot.liveSetup })); }
        catch { cleanup(); reject(Error("통화 설정을 전송하지 못했어요.")); }
      };
      ws.onmessage = event => {
        if (this.closed) return;
        try {
          const data = event.data as string | ArrayBuffer;
          const wire: LiveWireMessage = JSON.parse(typeof data === "string" ? data : decoder.decode(data));
          if (wire.setupComplete && !this.ready) {
            this.ready = true;
            cleanup();
            this.callbacks.onStatus("AI 피싱범 음성 통화 연결됨");
            resolve();
          }
          if (wire.serverContent) this.onMessage(wire.serverContent);
          if (wire.goAway) this.callbacks.onStatus("통화 연결 만료가 가까워졌어요. 이제 통화를 종료해 주세요.");
        } catch {
          this.callbacks.onError("음성 응답을 처리하지 못했어요. 다시 시도해 주세요.");
        }
      };
      ws.onerror = () => {
        if (this.closed) return;
        cleanup();
        if (!this.ready) reject(Error("AI 음성 서버와 연결하지 못했어요."));
        else this.callbacks.onError("AI 음성 통화 연결에 문제가 발생했어요.");
      };
      ws.onclose = () => {
        if (this.closed) return;
        cleanup();
        if (!this.ready) reject(Error("AI 음성 통화가 종료됐어요. 연결 설정을 확인해 주세요."));
        else this.callbacks.onError("음성 통화 연결이 끊겼어요. 통화를 종료하고 이후 대응을 연습할 수 있어요.");
        this.ready = false;
        this.stopPlayback();
      };
    });
  }

  startConversation(): void {
    this.sendText("통화가 연결됐습니다. 상대방 역할의 첫 인사를 지금 시작해 주세요.");
  }
  sendText(text: string): void {
    if (!this.isConnected()) throw Error("현재 통화에 연결되지 않았어요.");
    // Gemini 3.1 Live accepts incremental text through realtimeInput.
    // clientContent is for initial history seeding, not a normal spoken turn.
    this.socket!.send(JSON.stringify({ realtimeInput: { text } }));
  }
  setMicrophoneEnabled(enabled: boolean): void {
    this.micEnabled = enabled;
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = enabled;
    if (!enabled && this.isConnected()) {
      this.socket?.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (this.gain) this.gain.gain.value = enabled ? 1 : 0;
  }
  private onMessage(data: ServerContent) {
    if (data.interrupted) this.stopPlayback();
    if (data.inputTranscription?.text) this.callbacks.onUserText(data.inputTranscription.text);
    if (data.outputTranscription?.text) this.callbacks.onModelText(data.outputTranscription.text);
    for (const part of data.modelTurn?.parts ?? []) {
      const audio = part.inlineData;
      if (audio?.data && audio.mimeType?.startsWith("audio/pcm")) this.playAudio(audio.data);
    }
    if (data.turnComplete && this.nodes.size === 0) this.callbacks.onSpeaking(false);
  }
  private playAudio(raw: string) {
    const ctx = this.ctx, gain = this.gain;
    if (!ctx || !gain || this.closed) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = pcm16ToAudioBuffer(ctx, raw);
      source.connect(gain);
      const when = Math.max(this.playhead, ctx.currentTime + 0.02);
      source.start(when);
      this.playhead = when + source.buffer.duration;
      this.nodes.add(source);
      this.callbacks.onSpeaking(true);
      source.onended = () => {
        this.nodes.delete(source);
        source.disconnect();
        if (!this.nodes.size) this.callbacks.onSpeaking(false);
      };
    } catch {
      this.callbacks.onError("AI 음성을 재생하지 못했어요.");
    }
  }
  private stopPlayback() {
    for (const source of this.nodes) {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    }
    this.nodes.clear();
    if (this.ctx) this.playhead = this.ctx.currentTime;
    this.callbacks.onSpeaking(false);
  }
  close(): void {
    this.closed = true;
    this.ready = false;
    this.stopPlayback();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      try { this.socket.close(); } catch { /* already closed */ }
    }
    this.socket = null;
    this.micNode?.disconnect();
    this.source?.disconnect();
    this.silent?.disconnect();
    this.gain?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
