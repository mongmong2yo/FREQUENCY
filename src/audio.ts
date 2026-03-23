import lamejs from 'lamejs';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volumeGain: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private currentFreq: number | string | null = null;
  private _volume: number = 0.5;
  private _speed: number = 1.0;
  private noiseBuffer: AudioBuffer | null = null;
  private timeouts: number[] = [];
  private delayNode: DelayNode | null = null;
  private feedbackNode: GainNode | null = null;
  private activeLfos: { osc: OscillatorNode, baseFreq: number }[] = [];
  private activeBeats: { osc: OscillatorNode, baseFreq: number, beatDiff: number }[] = [];
  private harmonyGain: GainNode | null = null;
  private currentHarmonyFreqs: number[] = [];
  private pulseGain: GainNode | null = null;
  private speedChangeTimeout: number | null = null;
  private unlocked: boolean = false;

  private unlockAudioSession() {
    if (this.unlocked) return;
    try {
      // Modern iOS (17+) handling: force audio session into playback mode
      if ('audioSession' in navigator) {
        try {
          (navigator as any).audioSession.type = 'playback';
        } catch (err) {
          console.warn("Failed to set audioSession type:", err);
        }
      }

      // Legacy fallback (iOS < 17): Plays a tiny silent base64 MP3 to trick iOS
      const audio = new Audio("data:audio/mp3;base64,//MkxAAHiAICWABElBeKPL/RANb2w+yiT1g/gTok//lP/W/l3h8QO/OCdCqCW2Cw//MkxAQHkAIWUAhEmAQXWUOFW2dxPu//9mr60ElY5sseQ+xxesmHKtZr7bsqqX2L//MkxAgFwAYiQAhEAC2hq22d3///9FTV6tA36JdgBJoOGgc+7qvqej5Zu7/7uI9l//MkxBQHAAYi8AhEAO193vt9KGOq+6qcT7hhfN5FTInmwk8RkqKImTM55pRQHQSq//MkxBsGkgoIAABHhTACIJLf99nVI///yuW1uBqWfEu7CgNPWGpUadBmZ////4sL//MkxCMHMAH9iABEmAsKioqKigsLCwtVTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVV//MkxCkECAUYCAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");
      audio.muted = false;
      audio.setAttribute('playsinline', '');
      audio.play().then(() => {
        this.unlocked = true;
      }).catch((e) => {
        console.warn("Audio unlock failed:", e);
      });
    } catch (err) {
      console.warn("Audio object creation failed:", err);
    }
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.noiseBuffer = this.createBrownNoiseBuffer(this.ctx);
    }
  }

  private createBrownNoiseBuffer(ctx: AudioContext) {
    const bufferSize = ctx.sampleRate * 5; // 5 seconds
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5; 
    }
    return buffer;
  }

  setVolume(value: number) {
    this._volume = value;
    if (this.volumeGain && this.ctx) {
      this.volumeGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    }
  }

  get volume() {
    return this._volume;
  }

  setSpeed(value: number) {
    this._speed = value;
    if (this.ctx) {
      this.activeLfos.forEach(lfo => {
        lfo.osc.frequency.setTargetAtTime(lfo.baseFreq * this._speed, this.ctx!.currentTime, 0.1);
      });
      this.activeBeats.forEach(beat => {
        beat.osc.frequency.setTargetAtTime(beat.baseFreq + beat.beatDiff * this._speed, this.ctx!.currentTime, 0.1);
      });
      
      if (this.speedChangeTimeout) {
        window.clearTimeout(this.speedChangeTimeout);
      }

      this.speedChangeTimeout = window.setTimeout(() => {
        // Reschedule chimes immediately if in harmony mode
        if (this.currentFreq === 'harmony' && this.currentHarmonyFreqs.length > 0) {
          this.timeouts.forEach(id => window.clearTimeout(id));
          this.timeouts = [];
          
          this.currentHarmonyFreqs.forEach((freq, index) => {
            // Stagger them properly based on the new speed to prevent a cluster of chimes
            // Increased the base stagger to make them sparser
            const initialDelay = (index * 6000 + Math.random() * 4000) / this._speed;
            const timeoutId = window.setTimeout(() => this.playChime(freq), initialDelay);
            this.timeouts.push(timeoutId);
          });
        } else if (typeof this.currentFreq === 'number') {
          // Reschedule pulse immediately in normal mode
          this.timeouts.forEach(id => window.clearTimeout(id));
          this.timeouts = [];
          
          const initialDelay = (6000 + Math.random() * 4000) / this._speed;
          const timeoutId = window.setTimeout(() => this.playPulse(this.currentFreq as number), initialDelay);
          this.timeouts.push(timeoutId);
        }
      }, 500); // 500ms debounce to prevent storm of chimes when dragging slider
    }
  }

  get speed() {
    return this._speed;
  }

  private setupNatureSound() {
    if (!this.ctx || !this.noiseBuffer || !this.masterGain) return;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 350; // Base muffled sound
    noiseFilter.Q.value = 0.5;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.35; // Base volume for nature sound

    // Modulate noise filter to sound like waves crashing and receding
    const waveLfo = this.ctx.createOscillator();
    waveLfo.type = 'sine';
    const baseWaveFreq = 0.06;
    waveLfo.frequency.value = baseWaveFreq * this._speed; // ~16s cycle for slow, relaxing waves
    this.activeLfos.push({ osc: waveLfo, baseFreq: baseWaveFreq });
    
    // Filter sweep (sweeps cutoff between 100Hz and 600Hz)
    const waveFreqGain = this.ctx.createGain();
    waveFreqGain.gain.value = 250; 
    waveLfo.connect(waveFreqGain);
    waveFreqGain.connect(noiseFilter.frequency);

    // Amplitude sweep (louder when frequency is higher, simulating wave crash)
    const waveAmpGain = this.ctx.createGain();
    waveAmpGain.gain.value = 0.2; // Sweeps volume between 0.15 and 0.55
    waveLfo.connect(waveAmpGain);
    waveAmpGain.connect(noiseGain.gain);

    waveLfo.start();

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    
    noiseSource.start();
    this.nodes.push(noiseSource, noiseFilter, noiseGain, waveLfo, waveFreqGain, waveAmpGain);
  }

  private playChime(freq: number) {
    if (this.currentFreq !== 'harmony' || !this.ctx || !this.harmonyGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    let panner: StereoPannerNode | GainNode;
    if (this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      (panner as StereoPannerNode).pan.value = (Math.random() * 2) - 1; // Random pan
    } else {
      panner = this.ctx.createGain();
    }

    // Randomize octave (+0, +1, or +2 octaves) for a wider musical spread
    const octaveMultiplier = Math.pow(2, Math.floor(Math.random() * 3));
    osc.type = 'sine';
    osc.frequency.value = freq * octaveMultiplier;

    // Bell-like Envelope (constant duration, independent of playback speed)
    const attackTime = 0.1;
    const decayTime = 5 + Math.random() * 3;

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08 + Math.random() * 0.05, this.ctx.currentTime + attackTime); // Soft attack
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + attackTime + decayTime); // Natural decay

    // Underwater / Far-away filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Start slightly muffled and sink deeper (underwater effect)
    filter.frequency.setValueAtTime(600 + Math.random() * 300, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(250, this.ctx.currentTime + attackTime + decayTime);
    filter.Q.value = 1.2;

    osc.connect(gain);
    gain.connect(filter);
    filter.connect(panner);
    panner.connect(this.harmonyGain);
    if (this.delayNode) {
      panner.connect(this.delayNode); // Send to delay for echo
    }

    osc.start();
    osc.stop(this.ctx.currentTime + attackTime + decayTime + 1); // Cleanup node after decay

    // Schedule next chime for this frequency (much longer interval to make it sparse)
    const nextTime = (12000 + Math.random() * 12000) / this._speed;
    const timeoutId = window.setTimeout(() => this.playChime(freq), nextTime);
    this.timeouts.push(timeoutId);
  }

  private playPulse(freq: number) {
    if (this.currentFreq !== freq || !this.ctx || !this.pulseGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    let panner: StereoPannerNode | GainNode;
    if (this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      (panner as StereoPannerNode).pan.value = (Math.random() * 1.5) - 0.75; // Random pan
    } else {
      panner = this.ctx.createGain();
    }

    osc.type = 'sine';
    osc.frequency.value = freq * 2; // One octave up for the pulse

    // Soft bell-like Envelope (constant duration, independent of playback speed)
    const attackTime = 0.05;
    const decayTime = 3;

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + attackTime + decayTime);

    // Underwater / Far-away filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500 + Math.random() * 200, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + attackTime + decayTime);
    filter.Q.value = 1.0;

    osc.connect(gain);
    gain.connect(filter);
    filter.connect(panner);
    panner.connect(this.pulseGain);

    osc.start();
    osc.stop(this.ctx.currentTime + attackTime + decayTime + 1);

    // Schedule next pulse
    const nextTime = (6000 + Math.random() * 6000) / this._speed;
    const timeoutId = window.setTimeout(() => this.playPulse(freq), nextTime);
    this.timeouts.push(timeoutId);
  }

  play(baseFreq: number) {
    this.unlockAudioSession();
    this.init();

    if (this.currentFreq === baseFreq && this.nodes.length > 0) {
      if (this.ctx?.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    this.stop(true);

    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.currentFreq = baseFreq;

    this.volumeGain = this.ctx.createGain();
    this.volumeGain.gain.value = this._volume;
    this.volumeGain.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.volumeGain);

    // Slow fade in for a relaxing vibe
    this.masterGain.gain.setTargetAtTime(0.8, this.ctx.currentTime, 4);

    this.pulseGain = this.ctx.createGain();
    this.pulseGain.gain.value = 0.6;
    this.pulseGain.connect(this.masterGain);
    this.nodes.push(this.pulseGain);

    // 1. Singing Bowl / Soft Bell Synth
    const bowlGain = this.ctx.createGain();
    bowlGain.gain.value = 0.7; // Slightly softer overall bowl volume
    
    // Add a lowpass filter to the bowl to completely remove harsh high frequencies
    const bowlFilter = this.ctx.createBiquadFilter();
    bowlFilter.type = 'lowpass';
    bowlFilter.frequency.value = Math.min(baseFreq * 2.5, 800); // Cap highs at 800Hz
    bowlFilter.Q.value = 0.5;
    
    bowlFilter.connect(this.masterGain);
    bowlGain.connect(bowlFilter);
    this.nodes.push(bowlGain, bowlFilter);

    const createOsc = (freq: number, type: OscillatorType, gainValue: number, panValue: number = 0) => {
      const osc = this.ctx!.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      
      const gain = this.ctx!.createGain();
      gain.gain.value = gainValue;
      
      let panner: StereoPannerNode | GainNode;
      if (this.ctx!.createStereoPanner) {
        panner = this.ctx!.createStereoPanner();
        (panner as StereoPannerNode).pan.value = panValue;
      } else {
        panner = this.ctx!.createGain();
      }
      
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(bowlGain);
      
      osc.start();
      this.nodes.push(osc, gain, panner);
      return { osc, gain };
    };

    // Fundamental and beating (Binaural effect)
    createOsc(baseFreq, 'sine', 0.4, -0.2);
    const beatOsc = createOsc(baseFreq + 1.5 * this._speed, 'sine', 0.4, 0.2); 
    this.activeBeats.push({ osc: beatOsc.osc, baseFreq: baseFreq, beatDiff: 1.5 });

    // Sub octave for depth (warmth) - changed from triangle to sine to remove buzzy highs
    createOsc(baseFreq / 2, 'sine', 0.35, 0);

    // Overtones for singing bowl timbre (lowered frequencies and gains to prevent piercing highs)
    createOsc(baseFreq * 2, 'sine', 0.1, -0.3);
    createOsc(baseFreq * 3, 'sine', 0.05, 0.3);

    // Slow LFO for breathing effect (amplitude modulation on the bowl)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    const baseLfoFreq = 0.05;
    lfo.frequency.value = baseLfoFreq * this._speed; // 20s cycle
    this.activeLfos.push({ osc: lfo, baseFreq: baseLfoFreq });
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain);
    lfoGain.connect(bowlGain.gain);
    lfo.start();
    this.nodes.push(lfo, lfoGain);

    // 2. Nature Sound (Ocean Waves using Brown Noise)
    this.setupNatureSound();

    // 3. Start rhythmic pulse
    const initialDelay = (Math.random() * 2000) / this._speed;
    const timeoutId = window.setTimeout(() => this.playPulse(baseFreq), initialDelay);
    this.timeouts.push(timeoutId);
  }

  playHarmony(frequencies: number[]) {
    this.unlockAudioSession();
    this.init();

    if (this.currentFreq === 'harmony' && this.nodes.length > 0) {
      if (this.ctx?.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    this.stop(true);

    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.currentFreq = 'harmony';
    this.currentHarmonyFreqs = frequencies;

    this.volumeGain = this.ctx.createGain();
    this.volumeGain.gain.value = this._volume;
    this.volumeGain.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.volumeGain);

    // Slow fade in
    this.masterGain.gain.setTargetAtTime(0.8, this.ctx.currentTime, 5);

    // Create a Delay Node for ethereal, musical echo
    this.delayNode = this.ctx.createDelay();
    this.delayNode.delayTime.value = 0.75; // 750ms constant delay
    this.feedbackNode = this.ctx.createGain();
    this.feedbackNode.gain.value = 0.4; // 40% feedback
    
    this.delayNode.connect(this.feedbackNode);
    this.feedbackNode.connect(this.delayNode);
    this.delayNode.connect(this.masterGain);
    this.nodes.push(this.delayNode, this.feedbackNode);

    this.harmonyGain = this.ctx.createGain();
    this.harmonyGain.gain.value = 0.8; 
    
    const harmonyFilter = this.ctx.createBiquadFilter();
    harmonyFilter.type = 'lowpass';
    harmonyFilter.frequency.value = 1500; // Keep it warm but allow chimes
    harmonyFilter.Q.value = 0.5;
    
    harmonyFilter.connect(this.masterGain);
    this.harmonyGain.connect(harmonyFilter);
    this.nodes.push(this.harmonyGain, harmonyFilter);

    // 1. Warm Drone (Lowest 2 frequencies) with Binaural Beating
    const droneFreqs = frequencies.slice(0, 2);
    droneFreqs.forEach((freq) => {
      // Base drone
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq / 2; // Sub octave for deep drone
      
      const gain = this.ctx!.createGain();
      gain.gain.value = 0.15; // Subtle drone
      
      let panner: StereoPannerNode | GainNode;
      if (this.ctx!.createStereoPanner) {
        panner = this.ctx!.createStereoPanner();
        (panner as StereoPannerNode).pan.value = -0.2;
      } else {
        panner = this.ctx!.createGain();
      }

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.harmonyGain!);
      osc.start();
      this.nodes.push(osc, gain, panner);

      // Beating drone (Binaural effect)
      const beatOsc = this.ctx!.createOscillator();
      beatOsc.type = 'sine';
      beatOsc.frequency.value = (freq / 2) + (1.5 * this._speed);
      
      const beatGain = this.ctx!.createGain();
      beatGain.gain.value = 0.15;
      
      let beatPanner: StereoPannerNode | GainNode;
      if (this.ctx!.createStereoPanner) {
        beatPanner = this.ctx!.createStereoPanner();
        (beatPanner as StereoPannerNode).pan.value = 0.2;
      } else {
        beatPanner = this.ctx!.createGain();
      }

      beatOsc.connect(beatGain);
      beatGain.connect(beatPanner);
      beatPanner.connect(this.harmonyGain!);
      beatOsc.start();
      this.nodes.push(beatOsc, beatGain, beatPanner);

      this.activeBeats.push({ osc: beatOsc, baseFreq: freq / 2, beatDiff: 1.5 });
    });

    // Start chimes with wide initial staggers to prevent them from playing all at once
    frequencies.forEach((freq, index) => {
      const initialDelay = (index * 6000 + Math.random() * 4000) / this._speed; // Spread out initial hits
      const timeoutId = window.setTimeout(() => this.playChime(freq), initialDelay);
      this.timeouts.push(timeoutId);
    });

    // Add Nature Sound
    this.setupNatureSound();
  }

  pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  stop(immediate = false) {
    // Clear all generative timeouts
    this.timeouts.forEach(id => window.clearTimeout(id));
    this.timeouts = [];

    if (this.masterGain && this.ctx) {
      const nodesToStop = [...this.nodes];
      
      if (immediate) {
        this.masterGain.gain.value = 0;
        nodesToStop.forEach(node => {
          if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) {
            try { node.stop(); } catch(e) {}
          }
          node.disconnect();
        });
      } else {
        this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 2);
        setTimeout(() => {
          nodesToStop.forEach(node => {
            if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) {
              try { node.stop(); } catch(e) {}
            }
            node.disconnect();
          });
        }, 2500);
      }
      
      this.nodes = [];
      this.masterGain = null;
      this.volumeGain = null;
      this.harmonyGain = null;
      this.pulseGain = null;
      this.currentFreq = null;
      this.currentHarmonyFreqs = [];
      this.delayNode = null;
      this.feedbackNode = null;
      this.activeLfos = [];
      this.activeBeats = [];
    }
  }

  async exportAudio(frequency: number | number[], duration: number = 180): Promise<Blob> {
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

    // Recreate noise buffer for offline context
    const noiseBuffer = this.createBrownNoiseBuffer(offlineCtx as any);

    // Setup Master Gain
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 0.8; // Max volume for export
    masterGain.connect(offlineCtx.destination);

    // Setup Nature Sound
    const noiseSource = offlineCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = offlineCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 350;
    noiseFilter.Q.value = 0.5;

    const noiseGain = offlineCtx.createGain();
    noiseGain.gain.value = 0.35;

    const waveLfo = offlineCtx.createOscillator();
    waveLfo.type = 'sine';
    waveLfo.frequency.value = 0.06;
    
    const waveFreqGain = offlineCtx.createGain();
    waveFreqGain.gain.value = 250; 
    waveLfo.connect(waveFreqGain);
    waveFreqGain.connect(noiseFilter.frequency);

    const waveAmpGain = offlineCtx.createGain();
    waveAmpGain.gain.value = 0.2;
    waveLfo.connect(waveAmpGain);
    waveAmpGain.connect(noiseGain.gain);

    waveLfo.start(0);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(0);

    if (typeof frequency === 'number') {
      // Single frequency logic (Singing Bowl)
      const baseFreq = frequency;
      const bowlGain = offlineCtx.createGain();
      bowlGain.gain.value = 0.7;
      
      const bowlFilter = offlineCtx.createBiquadFilter();
      bowlFilter.type = 'lowpass';
      bowlFilter.frequency.value = Math.min(baseFreq * 2.5, 800);
      bowlFilter.Q.value = 0.5;
      
      bowlFilter.connect(masterGain);
      bowlGain.connect(bowlFilter);

      const createOsc = (freq: number, type: OscillatorType, gainValue: number, panValue: number = 0) => {
        const osc = offlineCtx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        
        const gain = offlineCtx.createGain();
        gain.gain.value = gainValue;
        
        let panner: StereoPannerNode | GainNode;
        if (offlineCtx.createStereoPanner) {
          panner = offlineCtx.createStereoPanner();
          (panner as StereoPannerNode).pan.value = panValue;
        } else {
          panner = offlineCtx.createGain();
        }
        
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(bowlGain);
        
        osc.start(0);
      };

      createOsc(baseFreq, 'sine', 0.4, -0.2);
      createOsc(baseFreq + 1.5, 'sine', 0.4, 0.2); 
      createOsc(baseFreq / 2, 'sine', 0.35, 0);
      createOsc(baseFreq * 2, 'sine', 0.1, -0.3);
      createOsc(baseFreq * 3, 'sine', 0.05, 0.3);

      const lfo = offlineCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05;
      const lfoGain = offlineCtx.createGain();
      lfoGain.gain.value = 0.15;
      lfo.connect(lfoGain);
      lfoGain.connect(bowlGain.gain);
      lfo.start(0);

    } else {
      // Harmony logic
      const delayNode = offlineCtx.createDelay();
      delayNode.delayTime.value = 0.75;
      const feedbackNode = offlineCtx.createGain();
      feedbackNode.gain.value = 0.4;
      
      delayNode.connect(feedbackNode);
      feedbackNode.connect(delayNode);
      delayNode.connect(masterGain);

      const harmonyGain = offlineCtx.createGain();
      harmonyGain.gain.value = 0.8; 
      
      const harmonyFilter = offlineCtx.createBiquadFilter();
      harmonyFilter.type = 'lowpass';
      harmonyFilter.frequency.value = 1500;
      harmonyFilter.Q.value = 0.5;
      
      harmonyFilter.connect(masterGain);
      harmonyGain.connect(harmonyFilter);

      const droneFreqs = frequency.slice(0, 2);
      droneFreqs.forEach((freq) => {
        const osc = offlineCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq / 2;
        const gain = offlineCtx.createGain();
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(harmonyGain);
        osc.start(0);
      });

      // Pre-schedule chimes for the entire duration
      frequency.forEach((freq, index) => {
        let currentTime = (index * 3.5 + Math.random() * 2);
        while (currentTime < duration) {
          const osc = offlineCtx.createOscillator();
          const gain = offlineCtx.createGain();
          
          let panner: StereoPannerNode | GainNode;
          if (offlineCtx.createStereoPanner) {
            panner = offlineCtx.createStereoPanner();
            (panner as StereoPannerNode).pan.value = (Math.random() * 2) - 1;
          } else {
            panner = offlineCtx.createGain();
          }

          const octaveMultiplier = Math.pow(2, Math.floor(Math.random() * 3));
          osc.type = 'sine';
          osc.frequency.value = freq * octaveMultiplier;

          const attackTime = 0.1;
          const decayTime = (5 + Math.random() * 3);

          gain.gain.setValueAtTime(0, currentTime);
          gain.gain.linearRampToValueAtTime(0.08 + Math.random() * 0.05, currentTime + attackTime);
          gain.gain.exponentialRampToValueAtTime(0.001, currentTime + attackTime + decayTime);

          osc.connect(gain);
          gain.connect(panner);
          panner.connect(harmonyGain);
          panner.connect(delayNode);

          osc.start(currentTime);
          osc.stop(currentTime + attackTime + decayTime + 1);

          currentTime += (12 + Math.random() * 15);
        }
      });
    }

    // Fade out at the end
    masterGain.gain.setValueAtTime(0.8, duration - 5);
    masterGain.gain.linearRampToValueAtTime(0, duration);

    const renderedBuffer = await offlineCtx.startRendering();
    return this.audioBufferToMp3(renderedBuffer);
  }

  private audioBufferToMp3(buffer: AudioBuffer): Blob {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
    const mp3Data: Int8Array[] = [];

    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;

    const sampleBlockSize = 1152; // multiple of 576
    const leftInt16 = new Int16Array(left.length);
    const rightInt16 = new Int16Array(right.length);

    // Convert Float32 to Int16
    for (let i = 0; i < left.length; i++) {
      let sampleL = Math.max(-1, Math.min(1, left[i]));
      leftInt16[i] = sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7FFF;
      
      let sampleR = Math.max(-1, Math.min(1, right[i]));
      rightInt16[i] = sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7FFF;
    }

    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
      const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
      const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data as any[], { type: 'audio/mp3' });
  }
}

export const audioEngine = new AudioEngine();
