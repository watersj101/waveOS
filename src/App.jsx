import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Wifi, Cpu, Lock, Unlock, Activity, 
  Settings, Database, Mic, AlertTriangle, Radio, Terminal, Send, Eye, EyeOff, Scan, Server
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
  const [showKeys, setShowKeys] = useState(false);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  // Credentials
  const [xiKey, setXiKey] = useState(() => localStorage.getItem("XI_KEY") || "");
  const [xiVoice, setXiVoice] = useState(() => localStorage.getItem("XI_VOICE") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("GEMINI_KEY") || "");
  // Default to a safe fallback, but allow user override
  const [modelName, setModelName] = useState(() => localStorage.getItem("GEMINI_MODEL") || "gemini-1.5-flash");
  
  const audioRef = useRef(new Audio());

  // --- DIAGNOSTIC TOOL: LIST MODELS ---
  const checkAvailableModels = async () => {
    if (!geminiKey) return alert("Enter Gemini Key first");
    setDialogue("Scanning Google API for available models...");
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      const data = await response.json();
      
      if (data.models) {
        // Filter for 'generateContent' supported models
        const validModels = data.models
          .filter(m => m.supportedGenerationMethods.includes("generateContent"))
          .map(m => m.name.replace("models/", ""));
        
        alert("AVAILABLE MODELS:\n\n" + validModels.join("\n"));
        // Auto-select the first 'flash' model found if current one is invalid
        const bestMatch = validModels.find(m => m.includes("flash")) || validModels[0];
        if(bestMatch) {
            setModelName(bestMatch);
            localStorage.setItem("GEMINI_MODEL", bestMatch);
            setDialogue(`Model updated to: ${bestMatch}`);
        }
      } else {
        alert("Error: " + JSON.stringify(data));
      }
    } catch (e) {
      alert("Network Error: " + e.message);
    }
  };

  // --- NFC READER ---
  const scanNFC = async () => {
    if (!('NDEFReader' in window)) return alert("NFC not supported.");
    setStatus("SCANNING");
    setDialogue("Approach Security Tag...");
    setIsScanning(true);
    try {
      const ndef = new window.NDEFReader();
      await ndef.scan();
      ndef.onreading = (event) => {
        setIsScanning(false);
        setStatus("IDLE");
        setDialogue(`Tag Verified.`);
        speak("welcome", "Access granted. Welcome back, Boss.");
      };
    } catch (error) {
      setDialogue("NFC Error: " + error.message);
      setIsScanning(false);
    }
  };

  // --- VOICE INPUT ---
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) return alert("Voice input unavailable.");
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    setIsListening(true);
    setStatus("LISTENING");

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      askFriday(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => { setIsListening(false); setStatus("IDLE"); };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  // --- THE BRAIN ---
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
          systemInstruction: {
            parts: [{ text: "You are F.R.I.D.A.Y, a tactical AI OS. User is 'Boss'. Keep responses extremely concise (under 2 sentences). Tone: Professional, Irish, Crisp, slightly dry/sarcastic. No emojis." }]
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        setDialogue(`Error: ${data.error.message}`);
        setStatus("WARN");
      } else {
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        speak(null, reply);
      }
      
    } catch (e) {
      setDialogue(`Net Error: ${e.message}`);
      setStatus("WARN");
    }
    setIsThinking(false);
  };

  // --- THE VOICE ---
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
        if (!response.ok) throw new Error("Voice API Error");
        blob = await response.blob();
      }
      if (blob) {
        audioRef.current.src = URL.createObjectURL(blob);
        audioRef.current.play();
        audioRef.current.onended = () => setStatus("IDLE");
      }
    } catch (e) { setStatus("WARN"); setDialogue("Audio Module Failure."); }
  };

  return (
    <div className="relative w-full h-screen bg-black text-amber-500 font-mono overflow-hidden flex flex-col items-center justify-center select-none">
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #f59e0b 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

      {/* HEADER */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-40">
        <div className="flex gap-4 text-xs font-bold tracking-widest opacity-80">
          <div className="flex items-center gap-2"><Cpu className="w-3 h-3"/> FRIDAY</div>
          <div className="flex items-center gap-2"><Wifi className="w-3 h-3"/> {status}</div>
        </div>
        <button onClick={() => setShowAdmin(!showAdmin)} className="p-2 opacity-50 hover:opacity-100"><Settings className="w-5 h-5" /></button>
      </div>

      {/* ADMIN PANEL */}
      {showAdmin && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl p-8 flex flex-col gap-4 animate-in slide-in-from-bottom duration-300 overflow-y-auto">
          <div className="flex justify-between items-center text-white mb-2">
            <h2 className="text-xl font-bold flex items-center gap-2"><Database/> SETTINGS</h2>
            <button onClick={() => setShowKeys(!showKeys)} className="p-2 hover:text-amber-500">{showKeys ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
          </div>
          
          <label className="text-[10px] uppercase opacity-50 font-bold">API KEYS</label>
          <input type={showKeys ? "text" : "password"} value={xiKey} onChange={(e) => { setXiKey(e.target.value); localStorage.setItem("XI_KEY", e.target.value); }} className="w-full bg-amber-500/10 border border-amber-500/20 p-3 rounded text-sm outline-none font-mono" placeholder="ElevenLabs Key" />
          <input type={showKeys ? "text" : "password"} value={geminiKey} onChange={(e) => { setGeminiKey(e.target.value); localStorage.setItem("GEMINI_KEY", e.target.value); }} className="w-full bg-amber-500/10 border border-amber-500/20 p-3 rounded text-sm outline-none font-mono" placeholder="Gemini API Key" />
          <input type={showKeys ? "text" : "password"} value={xiVoice} onChange={(e) => { setXiVoice(e.target.value); localStorage.setItem("XI_VOICE", e.target.value); }} className="w-full bg-amber-500/10 border border-amber-500/20 p-3 rounded text-sm outline-none font-mono" placeholder="Voice ID" />
          
          <div className="h-px bg-amber-500/20 my-2"></div>
          
          <label className="text-[10px] uppercase opacity-50 font-bold">BRAIN MODEL</label>
          <div className="flex gap-2">
            <input type="text" value={modelName} onChange={(e) => { setModelName(e.target.value); localStorage.setItem("GEMINI_MODEL", e.target.value); }} className="flex-1 bg-amber-500/10 border border-amber-500/20 p-3 rounded text-sm outline-none font-mono" placeholder="gemini-1.5-flash" />
            <button onClick={checkAvailableModels} className="bg-amber-600/20 border border-amber-500/30 p-3 rounded text-amber-500"><Server className="w-5 h-5"/></button>
          </div>
          <p className="text-[10px] opacity-50">Tap the server icon to auto-detect valid models.</p>

          <button onClick={() => setShowAdmin(false)} className="mt-auto py-6 text-xs uppercase opacity-50">[ CLOSE ]</button>
        </div>
      )}

      {/* VISUAL CORE */}
      <div className="relative z-10 w-full max-w-sm aspect-square flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="absolute w-[85%] h-[85%] border border-amber-500/20 rounded-full border-dashed" />
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute w-[70%] h-[70%] border-2 border-amber-500/30 rounded-full border-t-transparent border-l-transparent" />
        <motion.div animate={{ scale: status === "SPEAKING" || status === "THINKING" || status === "SCANNING" ? [1, 1.1, 1] : 1 }} className={`w-36 h-36 rounded-full flex items-center justify-center backdrop-blur-md border border-amber-500/40 bg-amber-500/5`}>
          {status === "THINKING" ? <Activity className="w-12 h-12 animate-spin"/> :
           status === "SCANNING" ? <Scan className="w-12 h-12 animate-pulse text-amber-300"/> :
           status === "LISTENING" ? <Mic className="w-12 h-12 animate-pulse text-white"/> :
           status === "SPEAKING" ? <Radio className="w-12 h-12 animate-pulse"/> :
           <Lock className="w-10 h-10 opacity-50"/>}
        </motion.div>
      </div>

      {/* DIALOGUE */}
      <div className="h-24 px-6 flex items-center justify-center text-center w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div key={dialogue} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-lg md:text-xl font-light tracking-wide text-amber-100 drop-shadow-md">"{dialogue}"</motion.div>
        </AnimatePresence>
      </div>

      {/* INPUT / NFC CONTROLS */}
      <div className="absolute bottom-10 w-full px-6 max-w-md flex gap-2">
        <button onClick={scanNFC} className={`p-4 border ${isScanning ? 'bg-amber-500 text-black' : 'bg-black border-amber-500/30 text-amber-500'} transition-all`}><Scan className="w-5 h-5" /></button>
        <button onClick={startListening} className={`p-4 border ${isListening ? 'bg-white text-black' : 'bg-black border-amber-500/30 text-amber-500'} transition-all`}><Mic className="w-5 h-5" /></button>
        <div className="flex-1 relative">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (askFriday(input), setInput(""))} className="w-full bg-black border border-amber-500/30 rounded-none p-4 text-amber-500 placeholder-amber-500/30 focus:border-amber-500 outline-none uppercase tracking-widest text-sm" placeholder="COMMAND..." />
        </div>
        <button onClick={() => { askFriday(input); setInput(""); }} className="bg-amber-600/20 border border-amber-500/30 p-4 text-amber-500 hover:bg-amber-500 hover:text-black transition-all">
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}


