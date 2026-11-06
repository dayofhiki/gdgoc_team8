/* Web Audio capture worklet: microphone float samples -> mono 16 kHz PCM.
   Worklet executes locally; raw recordings are not persisted. */
class MikkiLiveInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.pcm = new Int16Array(640); // 40 ms at 16 kHz
    this.position = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const rate = 16000 / sampleRate;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.phase += rate;
      if (this.phase >= 1) {
        this.phase -= 1;
        const value = Math.max(-1, Math.min(1, this.sum / this.count));
        this.pcm[this.position++] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
        this.sum = 0;
        this.count = 0;
        if (this.position === this.pcm.length) {
          const chunk = this.pcm;
          this.port.postMessage(chunk.buffer, [chunk.buffer]);
          this.pcm = new Int16Array(640);
          this.position = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("mikki-live-input", MikkiLiveInputProcessor);
