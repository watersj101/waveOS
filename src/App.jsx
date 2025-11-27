import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { 
  Shield, Wifi, Cpu, Lock, Unlock, Activity, 
  Settings, Database, Mic, AlertTriangle, Radio, Terminal, Send, Eye, EyeOff, Scan, Server, Image as ImageIcon, Zap, Aperture, Cloud, Save
} from 'lucide-react';

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDcm_jppsUKhc_IfCYgzOLjhyiyxPoiBBQ",
  authDomain: "waveos-memory.firebaseapp.com",
  projectId: "waveos-memory",
  storageBucket: "waveos-memory.firebasestorage.app",
  messagingSenderId: "317187959380",
  appId: "1:317187959380:web:ebbca6cce074f65f949bc1"
};

// Initialize Cloud
let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Init Error:", e);
}

// --- 1. LOCAL PERSISTENCE ---
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

// --- VISUAL COMPONENTS ---
const ReactorRing = ({ size, speed, reverse, color, dashed }) => (
  <motion.div 
    animate={{ rotate: reverse ? -360 : 360 }}
    transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
    className={`absolute rounded-full border ${dashed ? 'border-dashed' : 'border-solid'}`}
    style={{ width: size, height: size, borderColor: color, borderWidth: '1px', opacity: 0.3 }}
  />
);

const AudioVisualizer = ({ isActive, color }) => (
  <div className="flex items-end gap-1 h-8 justify-center absolute bottom-24 z-0 opacity-50">
    {[...Array(12)].map((_, i) => (
      <motion.div
        key={i}
        animate={{ 
          height: isActive ? ["10%", "80%", "30%", "100%", "20%"] : "10%",
          backgroundColor: color 
        }}
        transition={{ duration: 0.5, repeat: Infinity, ease: "linear", delay: i * 0.05, repeatType: "mirror" }}
        className="w-1 rounded-full"
      />
    ))}
  </div>
);

export default function WaveOS() {
  const [status, setStatus] = useState("LOCKED"); 
  const [dialogue, setDialogue] = useState("SYSTEM OFFLINE");
  const [showAdmin, setShowAdmin] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Credentials
  const [xiKey, setXiKey] = useState(() => localStorage.getItem("XI_KEY") || "");
  const [xiVoice, setXiVoice] = useState(() => localStorage.getItem("XI_VOICE") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("GEMINI_KEY") || "");
  const [modelName, setModelName] = useState(() => localStorage.getItem("GEMINI_MODEL") || "gemini-1.5-flash");
  
  // MEMORY (Cloud Linked)
  const [userBio, setUserBio] = useState("User is 'Boss'.");
  const [activeKeyId, setActiveKeyId] = useState(null);

  const audioRef = useRef(new Audio());
  const fileInputRef = useRef(null);

  // --- DIAGNOSTIC TOOL ---
  const checkAvailableModels = async () => {
    if (!geminiKey) return alert("Enter Gemini Key first");
    setDialogue("SCANNING API...");
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      const data = await response.json();
      
      if (data.models) {
        const validModels = data.models
          .filter(m => m.supportedGenerationMethods.includes("generateContent"))
          .map(m => m.name.replace("models/", ""));
        
        alert("AVAILABLE MODELS:\n\n" + validModels.join("\n"));
        // Auto-select 'flash' model
        const bestMatch = validModels.find(m => m.includes("gemini-2.0-flash")) || validModels.find(m => m.includes("gemini-1.5-flash")) || validModels[0];
        if(bestMatch) {
            setModelName(bestMatch);
            localStorage.setItem("GEMINI_MODEL", bestMatch);
            setDialogue(`ROUTE OPTIMIZED: ${bestMatch}`);
        }
      } else {
        alert("Error: " + JSON.stringify(data));
      }
    } catch (e) {
      alert("Network Error: " + e.message);
    }
  };

  // --- CLOUD SYNC LOGIC ---
  const syncMemory = async (tagId) => {
    if (!db) return setDialogue("CLOUD ERROR: No Config");
    setIsSyncing(true);
    setDialogue(`SYNCING CORE: ${tagId.slice(0,4)}...`);
    
    try {
      const docRef = doc(db, "users", tagId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserBio(data.bio);
        setActiveKeyId(tagId);
        setDialogue("MEMORY RESTORED.");
        speak(null, "Memory sync complete. Welcome back, Boss.");
      } else {
        await setDoc(docRef, { bio: userBio, created: new Date().toISOString() });
        setActiveKeyId(tagId);
        setDialogue("NEW KEY REGISTERED.");
        speak(null, "New hardware key detected. Memory core initialized.");
      }
      setStatus("IDLE");
    } catch (e) {
      setDialogue(`SYNC ERROR: ${e.message}`);
      setStatus("WARN");
    }
    setIsSyncing(false);
  };

  const saveMemoryToCloud = async () => {
    if (!db || !activeKeyId) return setDialogue("NO KEY ACTIVE");
    setDialogue("UPLOADING TO CLOUD...");
    try {
      await setDoc(doc(db, "users", activeKeyId), { bio: userBio, updated: new Date().toISOString() }, { merge: true });
      setDialogue("MEMORY SAVED.");
    } catch (e) { setDialogue("SAVE FAILED."); }
  };

  // --- NFC READER ---
  const scanNFC = async () => {
    if (!('NDEFReader' in window)) return alert("NFC UNSUPPORTED");
    setStatus("SCANNING"); setDialogue("SCANNING WAVEKEY..."); setIsScanning(true);
    try { 
      const ndef = new window.NDEFReader(); 
      await ndef.scan(); 
      ndef.onreading = (e) => { 
        setIsScanning(false); 
        syncMemory(e.serialNumber); // Trigger Cloud Sync
      }; 
    } catch (error) { setDialogue("SCAN ERROR"); setIsScanning(false); }
  };

  // --- BRAIN (Gemini) ---
  const askFriday = async (text) => {
    if (!geminiKey) return alert("MISSING API KEY");
    setIsThinking(true);
    setStatus("THINKING");
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          systemInstruction: { parts: [{ text: `You are F.R.I.D.A.Y. Tactical OS. Voice: Irish. USER DATA: ${userBio}. Be concise.` }] }
        })
      });
      const data = await response.json();
      if (data.error) { setDialogue(`ERR: ${data.error.message}`); setStatus("WARN"); }
      else { 
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        speak(null, reply); 
      }
    } catch (e) { setDialogue(`NET ERR: ${e.message}`); setStatus("WARN"); }
    setIsThinking(false);
  };

  // --- VISION ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDialogue("ANALYZING VISUAL DATA...");
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      askFridayWithVision(input || "Tactical analysis.", base64String, file.type);
    };
    reader.readAsDataURL(file);
  };

  const askFridayWithVision = async (text, base64Image, mimeType) => {
    if (!geminiKey) return;
    setIsThinking(true);
    setStatus("ANALYZING");
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
          systemInstruction: { parts: [{ text: `Tactical analysis. Concise. USER: ${userBio}` }] }
        })
      });
      const data = await response.json();
      if (data.error) { setDialogue(`VIS ERR: ${data.error.message}`); }
      else { 
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        speak(null, reply); 
      }
    } catch (e) { setDialogue("VIS UPLINK FAILED"); }
    setIsThinking(false);
  };

  // --- VOICE ---
  const speak = async (id, dynamicText = "") => {
    setStatus("SPEAKING");
    setDialogue(dynamicText || "PROCESSING...");
    try {
      let blob = id ? await getAudio(id) : null;
      if (!blob && dynamicText && xiKey) {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${xiVoice}/stream`, {
          method: 'POST',
          headers: { 'xi-api-key': xiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: dynamicText, model_id: "eleven_turbo_v2_5" })
        });
        if (!response.ok) throw new Error("VOICE API ERR");
        blob = await response.blob();
      }
      if (blob) {
        audioRef.current.src = URL.createObjectURL(blob);
        audioRef.current.play();
        audioRef.current.onended = () => setStatus("IDLE");
      }
    } catch (e) { setStatus("WARN"); setDialogue("AUDIO FAIL"); }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) return alert("MIC ERROR");
    const recognition = new window.webkitSpeechRecognition(); recognition.continuous = false; recognition.lang = 'en-US'; setIsListening(true); setStatus("LISTENING");
    recognition.onresult = (e) => { const t = e.results[0][0].transcript; setInput(t); askFriday(t); setIsListening(false); };
    recognition.onerror = () => { setIsListening(false); setStatus("IDLE"); }; recognition.onend = () => setIsListening(false); recognition.start();
  };

  // --- STYLING ---
  const accentColor = status === "WARN" ? "text-red-500" : status === "SPEAKING" ? "text-cyan-400" : "text-amber-500";
  const borderColor = status === "WARN" ? "border-red-500" : status === "SPEAKING" ? "border-cyan-400" : "border-amber-500";
  const hexColor = status === "WARN" ? "#ef4444" : status === "SPEAKING" ? "#22d3ee" : "#f59e0b";

  return (
    <div className={`relative w-full h-screen bg-black ${accentColor} font-mono overflow-hidden flex flex-col items-center justify-center select-none transition-colors duration-500`}>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_90%)] pointer-events-none"></div>

      {/* HEADER */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-40 border-b border-white/5 bg-black/50 backdrop-blur-sm">
        <div className="flex gap-6 text-[10px] md:text-xs font-bold tracking-[0.2em] opacity-80">
          <div className="flex items-center gap-2"><Cpu className="w-3 h-3"/> FRIDAY</div>
          <div className="flex items-center gap-2"><Cloud className={`w-3 h-3 ${isSyncing ? "animate-pulse text-white" : ""}`}/> MEMORY</div>
        </div>
        <button onClick={() => setShowAdmin(!showAdmin)} className="opacity-50 hover:opacity-100"><Settings className="w-5 h-5" /></button>
      </div>

      {/* ARC REACTOR */}
      <div className="relative z-10 w-full max-w-md aspect-square flex items-center justify-center">
        <ReactorRing size="85%" speed={40} color={hexColor} dashed={true} />
        <ReactorRing size="65%" speed={20} reverse={true} color={hexColor} dashed={false} />
        <motion.div animate={{ rotate: 360, scale: [1, 1.05, 1] }} transition={{ rotate: { duration: 5, repeat: Infinity, ease: "linear" }, scale: { duration: 2, repeat: Infinity } }} className={`absolute w-[45%] h-[45%] border-2 rounded-full border-t-transparent border-l-transparent ${borderColor}`} />
        <motion.div animate={{ scale: status === "SPEAKING" ? [1, 1.2, 1] : [1, 1.05, 1], boxShadow: `0 0 ${status === "SPEAKING" ? "60px" : "30px"} ${hexColor}40` }} className={`w-32 h-32 rounded-full flex items-center justify-center backdrop-blur-md border ${borderColor} bg-opacity-10 shadow-lg z-20`}>
          {status === "THINKING" || status === "ANALYZING" ? <Activity className="w-12 h-12 animate-spin"/> :
           status === "LISTENING" ? <Mic className="w-12 h-12 animate-bounce"/> :
           status === "SCANNING" ? <Scan className="w-12 h-12 animate-pulse"/> :
           status === "SPEAKING" ? <Radio className="w-12 h-12 animate-ping opacity-50"/> :
           <Lock className="w-12 h-12 opacity-80"/>}
        </motion.div>
        <AudioVisualizer isActive={status === "SPEAKING"} color={hexColor} />
      </div>

      {/* DIALOGUE */}
      <div className="h-32 px-8 flex items-center justify-center text-center w-full max-w-lg z-20">
        <AnimatePresence mode="wait">
          <motion.div key={dialogue} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 1.05 }} className="text-lg md:text-2xl font-light tracking-wide drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">"{dialogue}"</motion.div>
        </AnimatePresence>
      </div>

      {/* CONTROLS */}
      <div className="absolute bottom-10 w-[90%] max-w-md bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-2 flex gap-2 z-30 shadow-2xl">
        <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
        <button onClick={() => fileInputRef.current.click()} className="p-3 rounded-xl hover:bg-white/10 transition-colors"><ImageIcon className="w-6 h-6 opacity-70" /></button>
        <button onClick={scanNFC} className={`p-3 rounded-xl hover:bg-white/10 transition-colors ${isScanning ? 'text-white bg-white/20' : ''}`}><Scan className="w-6 h-6 opacity-70" /></button>
        <div className="flex-1 relative">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (askFriday(input), setInput(""))} className="w-full h-full bg-transparent outline-none text-center uppercase text-sm tracking-widest placeholder-white/20" placeholder="COMMAND LINE" />
        </div>
        <button onClick={startListening} className={`p-3 rounded-xl hover:bg-white/10 transition-colors ${isListening ? 'text-red-500 bg-white/10 animate-pulse' : ''}`}><Mic className="w-6 h-6 opacity-70" /></button>
        <button onClick={() => { askFriday(input); setInput(""); }} className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"><Send className="w-5 h-5" /></button>
      </div>

      {/* ADMIN PANEL */}
      {showAdmin && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl p-8 flex flex-col gap-4 animate-in slide-in-from-bottom duration-300 overflow-y-auto">
          <div className="flex justify-between items-center text-white mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><Database/> PROTOCOL SETTINGS</h2>
            <button onClick={() => setShowKeys(!showKeys)} className="p-2 hover:text-amber-500">{showKeys ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
          </div>
          
          <div className="space-y-4">
            <div className="group">
              <label className="text-[10px] uppercase opacity-40 font-bold tracking-widest mb-1 block">USER DOSSIER (Cloud Synced)</label>
              <textarea value={userBio} onChange={(e) => { setUserBio(e.target.value); }} className="w-full h-32 bg-white/5 border border-white/10 p-4 rounded-lg text-sm outline-none font-mono focus:border-amber-500/50 transition-colors" placeholder="Define Operator Identity..." />
              <button onClick={saveMemoryToCloud} className="mt-2 w-full py-2 bg-amber-500/20 text-amber-500 rounded text-xs font-bold uppercase hover:bg-amber-500/30 flex items-center justify-center gap-2"><Save className="w-3 h-3"/> Save to Cloud</button>
            </div>

            <div className="group">
              <label className="text-[10px] uppercase opacity-40 font-bold tracking-widest mb-1 block">API KEYS</label>
              <input type={showKeys ? "text" : "password"} value={xiKey} onChange={(e) => { setXiKey(e.target.value); localStorage.setItem("XI_KEY", e.target.value); }} className="w-full bg-white/5 border border-white/10 p-4 rounded-lg text-sm outline-none font-mono mb-2" placeholder="ElevenLabs" />
              <input type={showKeys ? "text" : "password"} value={geminiKey} onChange={(e) => { setGeminiKey(e.target.value); localStorage.setItem("GEMINI_KEY", e.target.value); }} className="w-full bg-white/5 border border-white/10 p-4 rounded-lg text-sm outline-none font-mono" placeholder="Gemini" />
              <input type={showKeys ? "text" : "password"} value={xiVoice} onChange={(e) => { setXiVoice(e.target.value); localStorage.setItem("XI_VOICE", e.target.value); }} className="w-full bg-white/5 border border-white/10 p-4 rounded-lg text-sm outline-none font-mono" placeholder="Voice ID" />
            </div>

            <div className="group">
              <label className="text-[10px] uppercase opacity-40 font-bold tracking-widest mb-1 block">BRAIN MODEL</label>
              <div className="flex gap-2">
                <input type="text" value={modelName} onChange={(e) => { setModelName(e.target.value); localStorage.setItem("GEMINI_MODEL", e.target.value); }} className="flex-1 bg-white/5 border border-white/10 p-4 rounded-lg text-sm outline-none font-mono" placeholder="gemini-1.5-flash" />
                <button onClick={checkAvailableModels} className="bg-amber-600/20 border border-amber-500/30 p-3 rounded text-amber-500"><Server className="w-5 h-5"/></button>
              </div>
            </div>
          </div>

          <button onClick={() => setShowAdmin(false)} className="mt-auto w-full py-4 border border-white/20 rounded-lg text-xs uppercase hover:bg-white/10 transition-colors">[ CLOSE TERMINAL ]</button>
        </div>
      )}

    </div>
  );
}


          
