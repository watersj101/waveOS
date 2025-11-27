import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Wifi, Cpu, Lock, Unlock, Activity, 
  Settings, Database, Mic, AlertTriangle, Radio, Terminal
} from 'lucide-react';

// --- 1. PERSISTENT MEMORY (IndexedDB) ---
// This saves your generated voice files so they don't cost money to reload.
const DB_NAME = "WaveOS_Core";
const STORE_NAME = "AudioBuffer";

const dbPromise = new Promise((resolve) => {
  if (typeof window === 'undefined') return resolve(null);
  const request = window.indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});

async function saveAudio(id, blob) {
  const db = await dbPromise;
  if(!db) return;
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(blob, id);
}

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

// --- 2. WAVE OS COMPONENT ---
export default function WaveOS() {
  const [status, setStatus] = useState("LOCKED"); // LOCKED, IDLE, SPEAKING, WARN
  const [dialogue, setDialogue] = useState("WaveOS Offline. Authentication Required.");
  const [showAdmin, setShowAdmin] = useState(false);
  
  // Persistence Keys
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("XI_KEY") || "");
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem("XI_VOICE") || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");

  const audioRef = useRef(new Audio());

  // THE SCRIPT: Edit these lines to change Friday's responses
  const PROTOCOLS = {
    "boot": "Wave OS Online. Systems nominal.",
    "welcome": "Identity confirmed. Welcome back, Boss.",
    "denied": "Access denied. Biometrics do not match.",
    "threat": "Threat detected. Shields up.",
    "focus": "Focus mode active. Disturbances muted."
  };

  // --- VOICE LOGIC ---
  const speak = async (id, dynamicText = "") => {
    setStatus("SPEAKING");
    if (dynamicText) setDialogue(dynamicText);
    else setDialogue(PROTOCOLS[id] || "Processing...");

    try {
      // 1. Check Local "Hard Drive" (Free)
      let blob = await getAudio(id);

      // 2. If not found, and we have custom text, call API (Paid)
      if (!blob && dynamicText && apiKey) {
        console.log("Stream Request Sent...");
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
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
        audioRef.current.play().catch(e => console.error("Play Error:", e));
        audioRef.current.onended = () => setStatus("IDLE");
      } else {
        console.warn(`Audio ID '${id}' missing.`);
        setStatus("IDLE");
      }
    } catch (e) {
      console.error(e);
      setStatus("WARN");
      setDialogue("Audio System Failure.");
    }
  };

  // --- ASSET GENERATOR ---
  const initializeProtocols = async () => {
    if (!apiKey || !voiceId) return alert("Credentials Missing");
    setIsGenerating(true);

    const keys = Object.keys(PROTOCOLS);
    for (let i = 0; i < keys.length; i++) {
      const id = keys[i];
      setGenProgress(`${i + 1}/${keys.length}: ${id}`);
      
      try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: PROTOCOLS[id],
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.8, similarity_boost: 0.8, style: 0.15 }
          })
        });
        
        if (!response.ok) throw new Error("API Error");
        const blob = await response.blob();
        await saveAudio(id, blob); // Save to IndexedDB
      } catch (e) {
        setDialogue(`Error: ${e.message}`);
        setIsGenerating(false);
        return;
      }
    }
    setGenProgress("Complete");
    setDialogue("Protocols Cached.");
    setIsGenerating(false);
  };

  // --- RENDER ---
  return (
    <div className="relative w-full h-screen bg-black text-amber-500 font-mono overflow-hidden flex flex-col items-center justify-center select-none">
      
      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle, #f59e0b 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,black_100%)]" />

      {/* HEADER */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-40">
        <div className="flex gap-4 text-xs font-bold tracking-widest opacity-80">
          <div className="flex items-center gap-2"><Cpu className="w-3 h-3"/> FRIDAY OS</div>
          <div className="flex items-center gap-2"><Wifi className="w-3 h-3"/> NET: SECURE</div>
        </div>
        <button onClick={() => setShowAdmin(!showAdmin)} className="p-2 opacity-50 hover:opacity-100">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* ADMIN TERMINAL */}
      {showAdmin && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl p-8 flex flex-col gap-6 animate-in slide-in-from-bottom duration-300">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white"><Terminal/> SYSTEM CONFIG</h2>
          
          <div className="space-y-1">
            <label className="text-[10px] uppercase opacity-50 tracking-widest">ElevenLabs API Key</label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); localStorage.setItem("XI_KEY", e.target.value); }}
              className="w-full bg-amber-500/10 border border-amber-500/20 p-4 rounded text-amber-500 text-sm focus:border-amber-500 outline-none placeholder-amber-500/20"
              placeholder="Paste Key..." 
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase opacity-50 tracking-widest">Voice ID</label>
            <input 
              type="text" 
              value={voiceId}
              onChange={(e) => { setVoiceId(e.target.value); localStorage.setItem("XI_VOICE", e.target.value); }}
              className="w-full bg-amber-500/10 border border-amber-500/20 p-4 rounded text-amber-500 text-sm focus:border-amber-500 outline-none placeholder-amber-500/20"
              placeholder="Paste ID..." 
            />
          </div>

          <div className="p-4 border border-amber-500/20 rounded bg-amber-500/5 mt-4">
            <div className="flex justify-between items-center mb-2">
               <h3 className="font-bold text-sm">Protocol Cache</h3>
               <span className="text-xs font-bold">{genProgress}</span>
            </div>
            <button 
              onClick={initializeProtocols}
              disabled={isGenerating}
              className="w-full py-4 bg-amber-600 text-black font-bold uppercase tracking-widest rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-500 transition-colors"
            >
              {isGenerating ? "CACHING..." : "INITIALIZE PROTOCOLS"}
            </button>
            <p className="text-[10px] mt-2 opacity-50 text-center">Downloads voice assets to local storage.</p>
          </div>

          <button onClick={() => setShowAdmin(false)} className="mt-auto py-6 text-xs uppercase opacity-50 hover:opacity-100">
            [ Close Terminal ]
          </button>
        </div>
      )}

      {/* THE EYE (HUD) */}
      <div className="relative z-10 w-full max-w-sm aspect-square flex items-center justify-center">
        {/* Rings */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute w-[85%] h-[85%] border border-amber-500/20 rounded-full border-dashed"
        />
        <motion.div 
          animate={{ rotate: -360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute w-[70%] h-[70%] border-2 border-amber-500/30 rounded-full border-t-transparent border-l-transparent"
        />

        {/* Core */}
        <motion.div
          animate={{ 
            scale: status === "SPEAKING" ? [1, 1.1, 1] : 1,
            opacity: status === "SPEAKING" ? 1 : 0.6,
            boxShadow: status === "SPEAKING" ? "0 0 50px rgba(245, 158, 11, 0.4)" : "0 0 0px transparent"
          }}
          className={`w-36 h-36 rounded-full flex items-center justify-center backdrop-blur-md border border-amber-500/40 bg-amber-500/5 transition-all duration-500`}
        >
          {status === "LOCKED" ? <Lock className="w-10 h-10 opacity-70"/> : 
           status === "WARN" ? <AlertTriangle className="w-12 h-12 text-red-500"/> :
           status === "SPEAKING" ? <Radio className="w-12 h-12 animate-pulse"/> :
           <Activity className="w-12 h-12"/>
          }
        </motion.div>
      </div>

      {/* DIALOGUE */}
      <div className="h-24 px-6 flex items-center justify-center text-center w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={dialogue}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`text-lg md:text-xl font-light tracking-wide ${status === "WARN" ? "text-red-400" : "text-amber-100"} drop-shadow-md`}
          >
            "{dialogue}"
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ACTIONS */}
      <div className="absolute bottom-16 flex flex-col gap-4 z-30 w-64">
        <button 
          onClick={() => {
             if(status === "LOCKED") {
                setStatus("IDLE");
                speak("welcome");
             } else {
                setStatus("LOCKED");
                setDialogue("System Offline.");
             }
          }}
          className="group relative px-6 py-4 bg-black border border-amber-500/40 text-amber-500 uppercase text-xs font-bold tracking-[0.2em] transition-all hover:border-amber-500 active:scale-95"
        >
          <span className="absolute inset-0 w-full h-full bg-amber-500/10 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"/>
          <span className="relative z-10">{status === "LOCKED" ? "INITIALIZE" : "SHUTDOWN"}</span>
        </button>
      </div>

    </div>
  );
}


