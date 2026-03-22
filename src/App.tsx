import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Play, Pause, Waves, Sparkles, Volume2, VolumeX, Moon, Heart, Brain, Coins, Infinity, Dna, HeartPulse, GraduationCap, Clover, Sun, Wind, Leaf, Snowflake, BatteryCharging, Flower2 } from 'lucide-react';
import { getFrequencyData, FrequencyData } from './gemini';
import { audioEngine } from './audio';
import Planetarium from './Planetarium';
import { MeteorCursor } from './components/MeteorCursor';

const HARMONY_MODES = [
  // 1열
  { id: 'cosmic', name: '우주적 조화', icon: Sparkles, freqs: [396, 417, 432, 528, 639, 741, 852, 888], desc: '모든 차크라를 정렬하는 8개의 솔페지오 하모니', color1: '#4a00e0', color2: '#8e2de2' },
  { id: 'dna', name: 'DNA 복구', icon: Dna, freqs: [396, 432, 528, 963], desc: '기적의 528Hz를 바탕으로 세포와 DNA의 치유를 돕는 하모니', color1: '#00c6ff', color2: '#0072ff' },
  { id: 'love', name: '사랑과 평화', icon: Heart, freqs: [528, 639, 852, 432], desc: '마음의 상처를 치유하고 긍정적인 에너지를 채우는 하모니', color1: '#ff9966', color2: '#ff5e62' },
  { id: 'focus', name: '집중과 몰입', icon: Brain, freqs: [417, 528, 741, 936], desc: '뇌의 활력을 깨우고 맑은 집중력을 유지하는 하모니', color1: '#11998e', color2: '#38ef7d' },

  // 2열
  { id: 'romance', name: '연애운 상승', icon: HeartPulse, freqs: [285, 528, 639, 741], desc: '매력을 높이고 새로운 인연을 끌어당기는 사랑의 하모니', color1: '#ff9a9e', color2: '#fecfef' },
  { id: 'reunion', name: '재회운 상승', icon: Infinity, freqs: [285, 432, 639, 852], desc: '관계의 회복(639Hz)과 기적(432Hz)을 부르는 끌어당김의 하모니', color1: '#ff758c', color2: '#ff7eb3' },
  { id: 'wealth', name: '금전운 상승', icon: Coins, freqs: [417, 528, 741, 888], desc: '풍요의 주파수 888Hz를 중심으로 막힌 금전운을 뚫어주는 하모니', color1: '#d4af37', color2: '#ffdf00' },
  { id: 'exam', name: '합격운 상승', icon: GraduationCap, freqs: [396, 417, 528, 852], desc: '불안을 없애고 직관력과 성공 에너지를 극대화하는 하모니', color1: '#4facfe', color2: '#00f2fe' },

  // 3열
  { id: 'stress', name: '스트레스 해소', icon: Leaf, freqs: [174, 396, 432, 528], desc: '복잡한 머릿속을 비우고 짓누르는 스트레스를 부드럽게 녹여내는 하모니', color1: '#43cea2', color2: '#185a9d' },
  { id: 'anger', name: '분노 조절', icon: Snowflake, freqs: [174, 285, 396, 417], desc: '끓어오르는 화를 차분하게 가라앉히고 이성적인 평온함을 되찾는 하모니', color1: '#e0c3fc', color2: '#8ec5fc' },
  { id: 'joy', name: '우울감 해소', icon: Sun, freqs: [396, 417, 528, 741], desc: '부정적인 감정을 씻어내고 밝고 긍정적인 활력을 채워주는 하모니', color1: '#f6d365', color2: '#fda085' },
  { id: 'burnout', name: '번아웃 탈출', icon: BatteryCharging, freqs: [417, 528, 741, 852], desc: '고갈된 에너지를 다시 채우고 무기력함에서 벗어나게 돕는 하모니', color1: '#ff9a44', color2: '#fc6076' },

  // 4열
  { id: 'calm', name: '감정 정화', icon: Wind, freqs: [174, 396, 417, 528], desc: '불쾌하고 짜증나는 감정을 시원하게 씻어내고 평정심을 되찾아주는 하모니', color1: '#89f7fe', color2: '#66a6ff' },
  { id: 'sleep', name: '깊은 수면', icon: Moon, freqs: [174, 285, 396, 432], desc: '긴장을 풀고 깊은 델타파 수면으로 유도하는 하모니', color1: '#1a2a6c', color2: '#b21f1f' },
  { id: 'selflove', name: '자기 사랑', icon: Flower2, freqs: [396, 528, 639, 963], desc: '상처받은 자존감을 회복하고 온전한 나 자신을 사랑하게 돕는 이너피스 하모니', color1: '#ffecd2', color2: '#fcb69f' },
  { id: 'luck', name: '행운 주파수', icon: Clover, freqs: [432, 528, 777, 888], desc: '우주의 긍정적인 파동과 동기화되어 뜻밖의 행운을 부르는 하모니', color1: '#43e97b', color2: '#38f9d7' },
];

export default function App() {
  const [theme, setTheme] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FrequencyData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [speed, setSpeed] = useState(1.0);
  const [isHarmonyMode, setIsHarmonyMode] = useState(false);
  const [activeHarmonyFreqs, setActiveHarmonyFreqs] = useState<number[]>([]);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme.trim()) return;
    
    setLoading(true);
    audioEngine.stop(true);
    setIsPlaying(false);
    setIsHarmonyMode(false);
    
    try {
      const result = await getFrequencyData(theme);
      setData(result);
    } catch (error) {
      console.error("Failed to generate frequency data:", error);
      alert("주파수 생성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }, [theme]);

  const handleHarmonyMode = useCallback((mode: typeof HARMONY_MODES[0]) => {
    setTheme('');
    setLoading(false);
    audioEngine.stop(true);
    setIsPlaying(false);
    setIsHarmonyMode(true);
    setActiveHarmonyFreqs(mode.freqs);
    
    setData({
      frequency: 0, // Placeholder, we display "Harmony" instead
      title: mode.name,
      description: mode.desc,
      color1: mode.color1,
      color2: mode.color2
    });
  }, []);

  const togglePlay = useCallback(() => {
    if (!data) return;
    
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      if (isHarmonyMode) {
        audioEngine.playHarmony(activeHarmonyFreqs);
      } else {
        audioEngine.play(data.frequency as number);
      }
      setIsPlaying(true);
    }
  }, [data, isPlaying, isHarmonyMode, activeHarmonyFreqs]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    audioEngine.setVolume(newVolume);
  }, []);

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseFloat(e.target.value);
    setSpeed(newSpeed);
    audioEngine.setSpeed(newSpeed);
  }, []);

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      setVolume(0);
      audioEngine.setVolume(0);
    } else {
      setVolume(0.5);
      audioEngine.setVolume(0.5);
    }
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioEngine.stop(true);
    };
  }, []);

  const bgStyle = useMemo(() => data 
    ? { background: `radial-gradient(circle at 30% 30%, ${data.color1} 0%, transparent 60%), radial-gradient(circle at 70% 70%, ${data.color2} 0%, transparent 60%)` }
    : { background: `radial-gradient(circle at 50% 50%, #1a1a2e 0%, transparent 50%)` }, [data]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      <MeteorCursor />
      <div className="atmosphere-bg" style={bgStyle} />
      <Planetarium />
      
      <div className="w-full max-w-4xl z-10 flex flex-col items-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 sm:mb-12"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif mb-3 sm:mb-4 tracking-wide flex items-center justify-center gap-2 sm:gap-3">
            <Waves className="w-6 h-6 sm:w-8 sm:h-8 opacity-70" />
            Frequency Alchemist
          </h1>
          <p className="text-white/50 text-xs sm:text-sm md:text-base font-light tracking-wider uppercase px-4">
            지금 상황이나 고민을 입력하거나<br />추천 하모니 모드를 선택하세요
          </p>
        </motion.div>

        <div className="w-full max-w-2xl relative mb-8 sm:mb-12">
          <motion.form 
            onSubmit={handleSearch}
            className="w-full relative mb-6 sm:mb-8 interactive-glow rounded-full"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <input
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="예: 직장상사에게 받은 스트레스, 누군가와 다퉜을 때..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-3 sm:py-4 pl-5 sm:pl-6 pr-14 sm:pr-16 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all backdrop-blur-md text-base sm:text-lg"
              disabled={loading}
            />
            <button 
              type="submit"
              disabled={loading || !theme.trim()}
              className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse text-white/70" />
              ) : (
                <Search className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />
              )}
            </button>
          </motion.form>
          
          <motion.div 
            className="w-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-lg sm:text-xl md:text-2xl font-serif font-light text-white/70 mb-4 sm:mb-6 text-center tracking-wide animate-text-glow">추천 하모니 모드</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
              {HARMONY_MODES.map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => handleHarmonyMode(mode)}
                    className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 p-2.5 sm:p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl sm:rounded-2xl transition-all duration-300 backdrop-blur-sm group interactive-glow"
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white/60 group-hover:text-white/90 transition-colors" />
                    <span className="text-xs sm:text-sm font-medium text-white/80 group-hover:text-white text-center">{mode.name}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>

        <AnimatePresence mode="wait">
          {data && !loading && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl glass-panel rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-12 flex flex-col items-center text-center relative overflow-hidden interactive-glow"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              
              <div className="font-serif text-5xl sm:text-6xl md:text-7xl font-light mb-2 tracking-tighter">
                {isHarmonyMode ? "Harmony" : data.frequency}
                {!isHarmonyMode && <span className="text-2xl sm:text-3xl md:text-4xl text-white/40 ml-1 sm:ml-2">Hz</span>}
              </div>
              
              <h2 className="text-xl sm:text-2xl md:text-3xl font-serif italic mb-4 sm:mb-6 text-white/90 px-2">
                {data.title}
              </h2>
              
              <p className="text-sm sm:text-base text-white/60 leading-relaxed mb-8 sm:mb-10 max-w-lg font-light px-2 sm:px-4">
                {data.description}
              </p>

              <div className="flex flex-col items-center gap-6 sm:gap-8 w-full">
                <button
                  onClick={togglePlay}
                  className={`group relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border transition-all duration-500 interactive-glow ${
                    isPlaying 
                      ? 'border-white/40 bg-white/10 shadow-[0_0_30px_rgba(255,255,255,0.2)]' 
                      : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                  }`}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 sm:w-8 sm:h-8 text-white/80 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 sm:w-8 sm:h-8 text-white/80 fill-current ml-1" />
                  )}
                  
                  {isPlaying && (
                    <div className="absolute -inset-3 sm:-inset-4 border border-white/20 rounded-full animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
                  )}
                </button>

                <div className="flex flex-col gap-5 sm:gap-6 w-full max-w-xs px-4 sm:px-0">
                  {/* Volume Control */}
                  <div className="flex items-center gap-3 sm:gap-4 w-full">
                    <button onClick={toggleMute} className="text-white/50 hover:text-white/80 transition-colors">
                      {volume === 0 ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={handleVolumeChange}
                      className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                    />
                  </div>

                  {/* Speed Control */}
                  <div className="flex flex-col items-center gap-1.5 sm:gap-2 w-full">
                    <div className="flex justify-between items-center w-full px-1">
                      <span className="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-widest">재생 속도 (피치 유지)</span>
                      <span className="text-white/90 text-[10px] sm:text-xs font-bold bg-white/10 px-1.5 sm:px-2 py-0.5 rounded-md">{speed.toFixed(1)}x</span>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 w-full">
                      <div className="text-white/50 text-[10px] sm:text-xs font-medium w-6 sm:w-8 text-right">0.5x</div>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={speed}
                        onChange={handleSpeedChange}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                      />
                      <div className="text-white/50 text-[10px] sm:text-xs font-medium w-6 sm:w-8">2.0x</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 sm:mt-8 text-[10px] sm:text-xs text-white/30 tracking-widest uppercase">
                {isPlaying ? 'Playing Frequency' : 'Paused'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
          className="mt-12 sm:mt-16 mb-4 sm:mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <a
            href="https://pf.kakao.com/_SHrxbG/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs sm:text-sm font-medium tracking-widest uppercase transition-all duration-300 backdrop-blur-sm interactive-glow"
          >
            Contact Us
          </a>
        </motion.div>
      </div>
    </div>
  );
}
