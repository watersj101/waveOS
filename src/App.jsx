import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Wifi, Cpu, Lock, Unlock, Activity, 
  Settings, Database, Mic, AlertTriangle, Radio, Terminal, Send, Eye, EyeOff, Scan, Server, Image as ImageIcon, Disc, Save, Plus
} from 'lucide-react';

// --- CONFIGURATION ---
const THEMES = [
  { id: 'tactical', name: 'Tactical Amber', bg: 'bg-black', text: 'text-amber-500', accent: 'border-amber-500/30' },
  { id: 'hologram', name: 'Stark Glass', bg: 'bg-slate-900', text: 'text-cyan-400', accent: 'border-cyan-400/30' },
  { id: 'orbital', name: 'Orbital Core', bg: 'bg-zinc-950', text: 'text-rose-500', accent: 'border-rose-500/30' },
  { id: 'flux', name: 'Audio Flux', bg: 'bg-indigo-950', text: 'text-violet-300', accent: 'border-violet-400/30' },
  { id: 'retro', name: 'CRT Terminal', bg: 'bg-[#0d1117]', text: 'text-green-500', accent: 'border-green-500/50' },
];

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
  const [dialogue, setDialogue] = useState("System Offline.");
  const [showAdmin, setShowAdmin] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  // Theme State
  const [themeIndex, setThemeIndex] = useState(0);
  const theme = THEMES[themeIndex];

  // Credentials
  const [xiKey, setXiKey] = useState(() => localStorage.getItem("XI_KEY") || "");
  const [xiVoice, setXiVoice] = useState(() => localStorage.getItem("XI_VOICE") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("GEMINI_KEY") || "");
  const [modelName, setModelName] = useState(() => localStorage.getItem("GEMINI_MODEL") || "gemini-1.5-flash");
  
  // MEMORY & TAGS
  const [userBio, setUserBio] = useState(() => localStorage.getItem("USER_BIO") || "User is 'Boss'.");
  const [knownTags, setKnownTags] = useState(() => JSON.parse(localStorage.getItem("KNOWN_TAGS") || "{}"));
  
  const audioRef = useRef(new Audio());

  // --- TAG MANAGEMENT ---
  const registerTag = (serial, name, actionTheme) => {
    const newTags = { ...knownTags, [serial]: { name, theme: actionTheme } };
    setKnownTags(newTags);
    localStorage.setItem("KNOWN_TAGS", JSON.stringify(newTags));
    setDialogue(`Tag Registered: ${name}`);
  };

  // --- NFC LOGIC ---
  const scanNFC = async (mode = "read") => {
    if (!('NDEFReader' in window)) return alert("NFC not supported.");
    
    setStatus("SCANNING");
    setDialogue(mode === "read" ? "Scan Command Card..." : "Scan Card to Register...");
    setIsScanning(true);

    try {
      const ndef = new window.NDEFReader();
      await ndef.scan();
      
      ndef.onreading = (event) => {
        const serial = event.serialNumber;
        
        if (mode === "register") {
          // Training Mode
          const name = prompt("Name this Card (e.g., 'Charizard' or 'Work Mode'):");
          if (name) {
            registerTag(serial, name, theme.id); // Save current theme with this card
            speak(null, `Protocol ${name} encoded.`);
          }
        } else {
          // Execution Mode
          const tagData = knownTags[serial];
          if (tagData) {
            // Found a known card!
            setDialogue(`Executing Protocol: ${tagData.name}`);
            
            // Switch Theme based on Card
            const newThemeIndex = THEMES.findIndex(t => t.id === tagData.theme);
            if (newThemeIndex !== -1) setThemeIndex(newThemeIndex);
            
            // Unlock & Greet
            setStatus("IDLE");
            speak(null, `${tagData.name} protocol active. Systems reconfigured.`);
          } else {
            // Unknown card
            setDialogue(`Unknown Tag: ${serial}`);
            speak(null, "Unrecognized hardware key.");
          }
        }
        setIsScanning(false);
      };
    } catch (error) {
      setDialogue("NFC Error: " + error.message);
      setIsScanning(false);
    }
  };

  // --- VOICE & BRAIN ---
  const askFriday = async (text) => {
    if (!geminiKey) return alert("Missing Gemini Key");
    setIsThinking(true);
    setStatus("THINKING");
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          systemInstruction: { parts: [{ text: `You are F.R.I.D.A.Y. Tone: Irish, Concise. USER DATA: ${userBio}` }] }
        })
      });
      const data = await response.json();
      if (data.error) { setDialogue(`Error: ${data.error.message}`); setStatus("WARN"); }
      else { 
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        speak(null, reply); 
      }
    } catch (e) { setDialogue(`Net Error: ${e.message}`); setStatus("WARN"); }
    setIsThinking(false);
  };

  const speak = async (id, dynamicText = "") => {
    setStatus("SPEAKING");
    setDialogue(dynamicText || "Processing...");
    try {
      let blob = id ? await getAudio(id) : null;
      if (!blob && dynamicText && xiKey) {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${xiVoice}/stream`, {
          method: 'POST',
          headers: { 'xi-api-key': xiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: dynamicText, model_id: "eleven_turbo_v2_5" })
        });
        blob = await response.blob();
      }
      if (blob) {
        audioRef.current.src = URL.createObjectURL(blob);
        audioRef.current.play();
        audioRef.current.onended = () => setStatus("IDLE");
      }
    } catch (e) { setStatus("WARN"); }
  };

  // --- VISUAL CORES ---
  const TacticalCore = () => (
    <div className="relative w-full max-w-sm aspect-square flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }} className={`absolute w-[90%] h-[90%] border ${theme.accent} rounded-full border-dashed`} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className={`absolute w-[70%] h-[70%] border-2 ${theme.accent} rounded-full border-t-transparent border-l-transparent`} />
      <div className={`w-32 h-32 rounded-full flex items-center justify-center border ${theme.accent} bg-opacity-10 backdrop-blur-sm`}>
        {status === "THINKING" ? <Activity className={`w-12 h-12 animate-spin ${theme.text}`} /> : <Cpu className={`w-12 h-12 ${theme.text}`} />}
      </div>
    </div>
  );

  return (
    <div className={`relative w-full h-screen ${theme.bg} ${theme.text} font-mono overflow-hidden flex flex-col items-center justify-center select-none transition-colors duration-700`}>
      
      {theme.id === 'tactical' && <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #f59e0b 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>}

      {/* HEADER */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-40">
        <div className="flex gap-4 text-xs font-bold tracking-widest opacity-80">
          <div className="flex items-center gap-2"><Cpu className="w-3 h-3"/> FRIDAY</div>
          <div className="flex items-center gap-2"><Wifi className="w-3 h-3"/> {theme.name.toUpperCase()}</div>
        </div>
        <button onClick={() => setShowAdmin(!showAdmin)} className="p-2 opacity-50 hover:opacity-100"><Settings className="w-5 h-5" /></button>
      </div>

      {/* ADMIN PANEL */}
      {showAdmin && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl p-8 flex flex-col gap-4 animate-in slide-in-from-bottom duration-300 overflow-y-auto">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white"><Settings/> SYSTEM CONFIG</h2>
          
          <div className="p-4 border border-white/10 rounded-lg">
            <label className="text-[10px] uppercase opacity-50 font-bold mb-2 block">INTERFACE THEME</label>
            <button onClick={() => setThemeIndex((prev) => (prev + 1) % THEMES.length)} className={`w-full py-4 border ${theme.accent} ${theme.text} font-bold uppercase tracking-widest rounded flex items-center justify-center gap-2`}>
              {theme.name}
            </button>
          </div>

          <div className="p-4 border border-white/10 rounded-lg">
            <label className="text-[10px] uppercase opacity-50 font-bold mb-2 block">TAG TRAINING</label>
            <p className="text-xs opacity-60 mb-2">1. Select a theme above. 2. Tap 'Register'. 3. Tap card.</p>
            <button onClick={() => scanNFC("register")} className="w-full py-4 bg-white/10 hover:bg-white/20 font-bold uppercase tracking-widest rounded flex items-center justify-center gap-2 text-white">
              <Plus className="w-4 h-4" /> REGISTER NEW CARD
            </button>
          </div>

          {/* CREDENTIALS */}
          <label className="text-[10px] uppercase opacity-50 font-bold mt-4">API KEYS</label>
          <input type="password" value={xiKey} onChange={(e) => { setXiKey(e.target.value); localStorage.setItem("XI_KEY", e.target.value); }} className="w-full bg-white/5 border border-white/10 p-3 rounded text-sm outline-none" placeholder="ElevenLabs Key" />
          <input type="password" value={geminiKey} onChange={(e) => { setGeminiKey(e.target.value); localStorage.setItem("GEMINI_KEY", e.target.value); }} className="w-full bg-white/5 border border-white/10 p-3 rounded text-sm outline-none" placeholder="Gemini API Key" />
          <input type="text" value={xiVoice} onChange={(e) => { setXiVoice(e.target.value); localStorage.setItem("XI_VOICE", e.target.value); }} className="w-full bg-white/5 border border-white/10 p-3 rounded text-sm outline-none" placeholder="Voice ID" />

          <button onClick={() => setShowAdmin(false)} className="mt-auto py-6 text-xs uppercase opacity-50">[ CLOSE ]</button>
        </div>
      )}

      {/* CORE DISPLAY */}
      <div className="relative z-10 w-full flex items-center justify-center min-h-[400px]">
        <TacticalCore />
      </div>

      {/* DIALOGUE */}
      <div className="h-24 px-6 flex items-center justify-center text-center w-full max-w-md z-20">
        <AnimatePresence mode="wait">
          <motion.div key={dialogue} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-lg md:text-xl font-light tracking-wide drop-shadow-md">"{dialogue}"</motion.div>
        </AnimatePresence>
      </div>

      {/* CONTROLS */}
      <div className="absolute bottom-10 w-full px-6 max-w-md flex gap-2 z-20">
        <button onClick={() => scanNFC("read")} className={`p-4 border ${theme.accent} bg-opacity-10 backdrop-blur ${isScanning ? 'bg-white/20' : ''}`}><Scan className="w-5 h-5" /></button>
        <button className={`p-4 border ${theme.accent} bg-opacity-10 backdrop-blur`}><Mic className="w-5 h-5" /></button>
        <div className="flex-1">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askFriday(input)} className={`w-full h-full bg-transparent border ${theme.accent} p-4 placeholder-current opacity-50 focus:opacity-100 outline-none uppercase text-sm`} placeholder="COMMAND..." />
        </div>
        <button onClick={() => askFriday(input)} className={`p-4 border ${theme.accent} bg-opacity-10 backdrop-blur`}><Send className="w-5 h-5" /></button>
      </div>
    </div>
  );
}


