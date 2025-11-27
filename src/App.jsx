import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Wifi, Cpu, Lock, Unlock, Activity, 
  Settings, Database, Mic, AlertTriangle, Radio, Terminal, Send
} from 'lucide-react';

// --- 1. PERSISTENCE ---
const DB_NAME = "WaveOS_Core";
const STORE_NAME = "AudioBuffer";
const dbPromise = new Promise((resolve) => {
  if (typeof window === 'undefined') return resolve(null);
  const request = window.indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});
async function getAudio(id) {
  const db = await dbPromise;
  if(!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export default function WaveOS() {
  const [status, setStatus] = useState("LOCKED"); 
  const [dialogue, setDialogue] = useState("WaveOS Offline.");
  const [showAdmin, setShowAdmin] = useState(false);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  
  // Credentials
  const [xiKey, setXiKey] = useState(() => localStorage.getItem("XI_KEY") || "");
  const [xiVoice, setXiVoice] = useState(() => localStorage.getItem("XI_VOICE") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("GEMINI_KEY") || "");
  
  const audioRef = useRef(new Audio());

  // --- THE BRAIN (Gemini 1.5 Flash) ---
  const askFriday = async (text) => {
    if (!geminiKey) return alert("Missing Brain Key (Gemini)");
    setIsThinking(true);
    setStatus("THINKING");

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          systemInstruction: {
            parts: [{ text: "You are F.R.I.D.A.Y, a tactical AI OS. User is 'Boss'. Keep responses extremely concise (under 2 sentences). Tone: Professional, Irish, Crisp, slightly dry/sarcastic if appropriate. No emojis." }]
          }
        })
      });
      
      const data = await response.json();
      const reply = data.candidates[0].content.parts[0].text;
      
      // Send the Brain's thought to the Voice
      speak(null, reply);
      
    } catch (e) {
      console.error(e);
      setDialogue("Neural Link Failed.");
      setStatus("IDLE");
    }
    setIsThinking(false);
  };

  // --- THE VOICE (ElevenLabs) ---
  const speak = async (id, dynamicText = "") => {
    setStatus("SPEAKING");
    setDialogue(dynamicText || "Processing...");

    try {
      // 1. Try Cache First (if ID provided)
      let blob = id ? await getAudio(id) : null;

      // 2. If no cache, Stream it (Paid)
      if (!blob && dynamicText && xiKey) {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${xiVoice}/stream`, {
          method: 'POST',
          headers: { 'xi-api-key': xiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: dynamicText,
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.8, similarity_boost: 0.8, style: 0.15 }
          })
        });
        blob = await response.blob();
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        audioRef.current.src = url;
        audioRef.current.play();
        audioRef.current.onended = () => setStatus("IDLE");
      }
    } catch (e) {
      setStatus("WARN");
    }
  };

  return (
    <div className="relative w-full h-screen bg-black text-amber-500 font-mono overflow-hidden flex flex-col items-center justify-center select-none">
      
      {/* BACKGROUND */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle, #f59e0b 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      {/* HEADER */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-40">
        <div className="flex gap-4 text-xs font-bold tracking-widest opacity-80">
          <div className="flex items-center gap-2"><Cpu className="w-3 h-3"/> FRIDAY</div>
          <div className="flex items-center gap-2"><Wifi className="w-3 h-3"/> {status}</div>
        </div>
        <button onClick={() => setShowAdmin(!showAdmin)} className="p-2 opacity-50 hover:opacity-100">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* ADMIN PANEL */}
      {showAdmin && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl p-8 flex flex-col gap-4 animate-in slide-in-from-bottom duration-300">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white"><Database/> KEYS</h2>
          
          <input type="password" value={xiKey} onChange={(e) => { setXiKey(e.target.value); localStorage.setItem("XI_KEY", e.target.value); }}
            className="w-full bg-amber-500/10 border border-amber-500/20 p-3 rounded text-sm outline-none" placeholder="ElevenLabs Key" />
            
          <input type="text" value={xiVoice} onChange={(e) => { setXiVoice(e.target.value); localStorage.setItem("XI_VOICE", e.target.value); }}
            className="w-full bg-amber-500/10 border border-amber-500/20 p-3 rounded text-sm outline-none" placeholder="Voice ID" />
            
          <input type="password" value={geminiKey} onChange={(e) => { setGeminiKey(e.target.value); localStorage.setItem("GEMINI_KEY", e.target.value); }}
            className="w-full bg-amber-500/10 border border-amber-500/20 p-3 rounded text-sm outline-none" placeholder="Gemini API Key" />

          <button onClick={() => setShowAdmin(false)} className="mt-auto py-6 text-xs uppercase opacity-50">[ CLOSE ]</button>
        </div>
      )}

      {/* VISUAL CORE */}
      <div className="relative z-10 w-full max-w-sm aspect-square flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute w-[85%] h-[85%] border border-amber-500/20 rounded-full border-dashed" />
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute w-[70%] h-[70%] border-2 border-amber-500/30 rounded-full border-t-transparent border-l-transparent" />
        
        <motion.div
          animate={{ scale: status === "SPEAKING" || status === "THINKING" ? [1, 1.1, 1] : 1, opacity: 1 }}
          className={`w-36 h-36 rounded-full flex items-center justify-center backdrop-blur-md border border-amber-500/40 bg-amber-500/5`}
        >
          {status === "THINKING" ? <Activity className="w-12 h-12 animate-spin"/> :
           status === "SPEAKING" ? <Radio className="w-12 h-12 animate-pulse"/> :
           <Lock className="w-10 h-10 opacity-50"/>}
        </motion.div>
      </div>

      {/* DIALOGUE */}
      <div className="h-24 px-6 flex items-center justify-center text-center w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div key={dialogue} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="text-lg md:text-xl font-light tracking-wide text-amber-100 drop-shadow-md">
            "{dialogue}"
          </motion.div>
        </AnimatePresence>
      </div>

      {/* INPUT TERMINAL */}
      <div className="absolute bottom-10 w-full px-6 max-w-md flex gap-2">
        <div className="flex-1 relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (askFriday(input), setInput(""))}
            className="w-full bg-black border border-amber-500/30 rounded-none p-4 text-amber-500 placeholder-amber-500/30 focus:border-amber-500 outline-none uppercase tracking-widest text-sm"
            placeholder="ENTER COMMAND..."
          />
          <div className="absolute right-0 top-0 h-full flex items-center pr-3 pointer-events-none">
            <span className="animate-pulse bg-amber-500 w-2 h-4 block"></span>
          </div>
        </div>
        <button 
          onClick={() => { askFriday(input); setInput(""); }}
          disabled={!input || isThinking}
          className="bg-amber-600/20 border border-amber-500/30 p-4 text-amber-500 hover:bg-amber-500 hover:text-black transition-all"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
}


