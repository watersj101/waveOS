import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { 
  Shield, Wifi, Cpu, Lock, Unlock, Activity, 
  Settings, Database, Mic, AlertTriangle, Radio, Terminal, Send, Eye, EyeOff, Scan, Server, Image as ImageIcon, Cloud, Save, Volume2, VolumeX, Play, Code, Sparkles, Brain, Zap, Mail, Bot, ChevronLeft, Globe
} from 'lucide-react';

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY_HERE",
  authDomain: "waveos-memory.firebaseapp.com",
  projectId: "waveos-memory",
  storageBucket: "waveos-memory.firebasestorage.app",
  messagingSenderId: "317187959380",
  appId: "1:317187959380:web:ebbca6cce074f65f949bc1"
};

let db;
try { const app = initializeApp(firebaseConfig); db = getFirestore(app); } catch (e) { console.error(e); }

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
  return new Promise((r) => { const tx = db.transaction(STORE_NAME, "readonly"); const req = tx.objectStore(STORE_NAME).get(id); req.onsuccess = () => r(req.result); req.onerror = () => r(null); });
}

// --- VISUALS ---
const ReactorRing = ({ size, speed, reverse, color, dashed }) => (
  <motion.div animate={{ rotate: reverse ? -360 : 360 }} transition={{ duration: speed, repeat: Infinity, ease: "linear" }} className={`absolute rounded-full border ${dashed ? 'border-dashed' : 'border-solid'}`} style={{ width: size, height: size, borderColor: color, borderWidth: '1px', opacity: 0.3 }} />
);

export default function WaveOS() {
  const [interfaceMode, setInterfaceMode] = useState("HUD"); 
  const [status, setStatus] = useState("LOCKED"); 
  const [dialogue, setDialogue] = useState("SYSTEM LOCKED.");
  const [chatHistory, setChatHistory] = useState([]); 
  
  const [showAdmin, setShowAdmin] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const [xiKey, setXiKey] = useState(() => localStorage.getItem("XI_KEY") || "");
  const [xiVoice, setXiVoice] = useState(() => localStorage.getItem("XI_VOICE") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("GEMINI_KEY") || "");
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem("CLAUDE_KEY") || "");
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem("OPENAI_KEY") || "");
  const [grokKey, setGrokKey] = useState(() => localStorage.getItem("GROK_KEY") || "");
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem("GOOGLE_CLIENT_ID") || "");
  const [gmailToken, setGmailToken] = useState(null);

  const [userBio, setUserBio] = useState("User is 'Boss'.");
  const [activeKeyId, setActiveKeyId] = useState(null);

  const audioRef = useRef(new Audio());
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  const updateMemory = async (newFact) => {
    const updatedBio = `${userBio}\n- ${newFact}`;
    setUserBio(updatedBio);
    if (db && activeKeyId) await setDoc(doc(db, "users", activeKeyId), { bio: updatedBio, updated: new Date().toISOString() }, { merge: true });
  };

  const connectGmail = () => {
    if (!googleClientId) return alert("Missing Google Client ID");
    const oauth2Endpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
    const form = document.createElement('form');
    form.setAttribute('method', 'GET');
    form.setAttribute('action', oauth2Endpoint);
    const params = {'client_id': googleClientId, 'redirect_uri': window.location.href, 'response_type': 'token', 'scope': 'https://www.googleapis.com/auth/gmail.readonly', 'include_granted_scopes': 'true', 'state': 'pass-through value'};
    for (var p in params) { var input = document.createElement('input'); input.setAttribute('type', 'hidden'); input.setAttribute('name', p); input.setAttribute('value', params[p]); form.appendChild(input); }
    document.body.appendChild(form); form.submit();
  };
  useEffect(() => { const hash = window.location.hash; if (hash && hash.includes('access_token')) { setGmailToken(new URLSearchParams(hash.substring(1)).get('access_token')); setDialogue("GMAIL LINKED."); window.history.pushState("", document.title, window.location.pathname); }}, []);
  
  const checkGmail = async () => {
    if (!gmailToken) return connectGmail();
    setDialogue("SCANNING INBOX...");
    try {
      const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=3', { headers: { Authorization: `Bearer ${gmailToken}` } });
      const listData = await listRes.json();
      if (listData.messages) {
        const summaries = [];
        for (const msg of listData.messages) {
          const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, { headers: { Authorization: `Bearer ${gmailToken}` } });
          const detail = await detailRes.json();
          summaries.push(`- ${detail.snippet}`);
        }
        askFriday(`Summarize emails: ${summaries.join(" ")}`);
      } else { setDialogue("NO NEW COMMS."); }
    } catch (e) { setDialogue("GMAIL ERROR."); setGmailToken(null); }
  };

  const determineProvider = async (text) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `Classify "${text}" as: [CODE, CREATIVE, NEWS, GENERAL]. Return ONLY the word.` }] }] })
      });
      const data = await response.json();
      const cls = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
      if (cls?.includes("CODE") && claudeKey) return 'claude';
      if (cls?.includes("CREATIVE") && openaiKey) return 'openai';
      if (cls?.includes("NEWS") && grokKey) return 'grok';
      return 'gemini';
    } catch (e) { return 'gemini'; }
  };

  const callLLM = async (provider, text, imagePart = null) => {
    const context = `You are F.R.I.D.A.Y. Context: ${userBio}. ${interfaceMode === 'LAB' ? 'Provide full code.' : 'Be concise.'} If learning fact, output [[MEMORY: fact]].`;
    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: imagePart ? [{ text }, imagePart] : [{ text }] }], systemInstruction: { parts: [{ text: context }] } })
      });
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    }
    if (provider === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'dangerously-allow-browser': 'true' },
        body: JSON.stringify({ model: "claude-3-sonnet-20240229", max_tokens: 2048, messages: [{ role: "user", content: text }], system: context })
      });
      const data = await response.json();
      return data.content?.[0]?.text;
    }
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: context }, { role: "user", content: text }] })
      });
      const data = await response.json();
      return data.choices?.[0]?.message?.content;
    }
    if (provider === 'grok') {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${grokKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: "grok-beta", messages: [{ role: "system", content: context }, { role: "user", content: text }] })
      });
      const data = await response.json();
      return data.choices?.[0]?.message?.content;
    }
  };

  const askFriday = async (text, imagePart = null) => {
    setIsThinking(true);
    setStatus("ROUTING...");
    try {
      const provider = interfaceMode === 'LAB' ? await determineProvider(text) : 'gemini';
      setStatus(`THINKING (${provider.toUpperCase()})`);
      const reply = await callLLM(provider, text, imagePart);
      if (reply) {
        const mem = reply.match(/\[\[MEMORY: (.*?)\]\]/);
        let cleanReply = reply;
        if (mem) { updateMemory(mem[1]); cleanReply = reply.replace(mem[0], ""); }
        if (interfaceMode === "LAB") {
          setChatHistory(prev => [...prev, { role: 'user', text }, { role: 'friday', text: cleanReply, model: provider }]);
        } else {
          setDialogue(cleanReply);
          if (!isMuted) speak(null, cleanReply);
        }
      } else { throw new Error("No Reply"); }
    } catch (e) { setDialogue(`ERR: ${e.message}`); setStatus("WARN"); }
    setIsThinking(false);
  };
  const speak = async (id, dt) => { 
    setStatus("SPEAKING");
    try {
      let blob = id ? await getAudio(id) : null;
      if (!blob && dt && xiKey) {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${xiVoice}/stream`, { method: 'POST', headers: {'xi-api-key': xiKey, 'Content-Type': 'application/json'}, body: JSON.stringify({ text: dt, model_id: "eleven_turbo_v2_5" })});
        blob = await res.blob();
      }
      if(blob) { audioRef.current.src = URL.createObjectURL(blob); audioRef.current.play(); audioRef.current.onended = () => setStatus("IDLE"); }
    } catch(e) { setStatus("WARN"); }
  };
  const scanNFC = async () => { 
    if (!('NDEFReader' in window)) return alert("NFC UNSUPPORTED");
    setStatus("SCANNING"); setDialogue("SCANNING KEY..."); setIsScanning(true);
    try { const ndef = new window.NDEFReader(); await ndef.scan(); ndef.onreading = (e) => { setIsScanning(false); syncMemory(e.serialNumber); }; } catch (e) { setIsScanning(false); }
  };
  const startListening = () => { 
    const r = new window.webkitSpeechRecognition(); r.lang = 'en-US'; setIsListening(true); setStatus("LISTENING");
    r.onresult = (e) => { askFriday(e.results[0][0].transcript); setIsListening(false); }; r.start();
  };
  const handleImage = (e) => { 
    const f = e.target.files[0]; const r = new FileReader(); r.onloadend = () => { askFriday(input || "Analyze.", { inline_data: { mime_type: f.type, data: r.result.split(',')[1] } }); }; r.readAsDataURL(f);
  };
  const syncMemory = async (tagId) => { 
    if(!db) return; setActiveKeyId(tagId); setDialogue("KEY VERIFIED."); speak(null, "Systems unlocked."); setStatus("IDLE");
  };

  const LabInterface = () => (
    <div className="absolute inset-0 z-20 bg-[#1e1e1e] flex flex-col font-sans">
      <div className="p-4 bg-[#252525] border-b border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center"><Code className="w-4 h-4 text-blue-400"/></div>
          <div><h1 className="text-sm font-bold text-white">Vibe Lab</h1></div>
        </div>
        <button onClick={() => setInterfaceMode("HUD")} className="p-2 bg-white/5 rounded-full"><Radio className="w-4 h-4 text-white/50"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
        {chatHistory.length === 0 && <div className="text-center text-white/20 mt-20"><Bot className="w-12 h-12 mx-auto mb-2 opacity-50"/>Ready to code, Boss.</div>}
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[90%] p-4 rounded-xl text-sm leading-relaxed whitespace-pre-wrap shadow-md ${msg.role === 'user' ? 'bg-[#a8c7fa] text-black rounded-tr-sm' : 'bg-[#303030] text-[#e3e3e3] rounded-tl-sm border border-white/5'}`}>
              {msg.text}
            </div>
            {msg.role === 'friday' && (
              <div className="flex items-center gap-2 mt-2 ml-2">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] uppercase tracking-wider font-bold ${msg.model === 'claude' ? 'bg-orange-500/20 text-orange-300' : msg.model === 'openai' ? 'bg-green-500/20 text-green-300' : msg.model === 'grok' ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-300'}`}>
                  {msg.model === 'claude' ? <Brain className="w-3 h-3"/> : msg.model === 'openai' ? <Zap className="w-3 h-3"/> : msg.model === 'grok' ? <Globe className="w-3 h-3"/> : <Sparkles className="w-3 h-3"/>}
                  {msg.model}
                </div>
                <button onClick={() => speak(null, msg.text)} className="opacity-30 hover:opacity-100"><Play className="w-3 h-3 text-white"/></button>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div className="absolute bottom-0 w-full p-4 bg-[#1e1e1e] border-t border-white/5">
        <div className="relative bg-[#303030] rounded-full p-2 flex items-center shadow-lg border border-white/5">
          <button onClick={() => fileInputRef.current.click()} className="p-3 text-white/50 hover:text-white"><ImageIcon className="w-6 h-6"/></button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className="flex-1 bg-transparent text-white placeholder-white/30 px-2 outline-none text-base" placeholder="Ask anything..." />
          <button onClick={handleSend} className="p-3 bg-blue-600 rounded-full text-white"><Send className="w-5 h-5"/></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`relative w-full h-screen bg-black ${status === 'WARN' ? 'text-red-500' : 'text-amber-500'} font-mono overflow-hidden flex flex-col items-center justify-center select-none`}>
      {interfaceMode === "LAB" ? <LabInterface /> : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_90%)] pointer-events-none"></div>
          <div className="absolute top-0 w-full p-6 flex justify-between items-center z-40">
            <div className="flex gap-4 text-xs font-bold tracking-[0.2em] opacity-80 text-amber-300"><Cpu className="w-3 h-3"/> WAVE OS v6.0</div>
            <div className="flex gap-4">
              <button onClick={() => setIsMuted(!isMuted)} className="opacity-50">{isMuted ? <VolumeX className="w-5 h-5 text-red-500"/> : <Volume2 className="w-5 h-5"/>}</button>
              <button onClick={() => setShowAdmin(!showAdmin)} className="opacity-50"><Settings className="w-5 h-5"/></button>
            </div>
          </div>
          <div className="relative z-10 w-full max-w-md aspect-square flex items-center justify-center">
            <ReactorRing size="85%" speed={40} color={status === 'WARN' ? '#ef4444' : '#f59e0b'} dashed={true} />
            <motion.div animate={{ rotate: 360, scale: [1, 1.05, 1] }} transition={{ rotate: { duration: 10, repeat: Infinity, ease: "linear" }, scale: { duration: 2, repeat: Infinity } }} className={`absolute w-[60%] h-[60%] border-2 rounded-full border-t-transparent border-l-transparent ${status === 'WARN' ? 'border-red-500' : 'border-amber-500'}`} />
            <div className="w-32 h-32 rounded-full flex items-center justify-center border border-current bg-opacity-10 backdrop-blur-md shadow-lg z-20">
              {status === "THINKING" ? <Activity className="w-12 h-12 animate-spin"/> : status === "LISTENING" ? <Mic className="w-12 h-12 animate-bounce"/> : <Radio className="w-12 h-12"/>}
            </div>
          </div>
          <div className="h-24 px-8 text-center flex flex-col items-center justify-center z-20">
            <AnimatePresence mode="wait"><motion.div key={dialogue} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-lg tracking-wide drop-shadow-md">"{dialogue}"</motion.div></AnimatePresence>
            {activeKeyId && <button onClick={() => setInterfaceMode("LAB")} className="mt-2 text-xs border border-current px-2 py-1 rounded hover:bg-white/10 flex items-center gap-1"><Code className="w-3 h-3"/> ENTER LAB</button>}
          </div>
          <div className="absolute bottom-10 w-[90%] max-w-md bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-2 flex gap-2 z-30">
            <input type="file" ref={fileInputRef} onChange={handleImage} className="hidden" accept="image/*" />
            <button onClick={() => fileInputRef.current.click()} className="p-3 rounded-xl hover:bg-white/10"><ImageIcon className="w-6 h-6 opacity-70" /></button>
            <button onClick={scanNFC} className="p-3 rounded-xl hover:bg-white/10"><Scan className="w-6 h-6 opacity-70" /></button>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askFriday(input)} className="flex-1 bg-transparent outline-none text-center uppercase text-sm tracking-widest placeholder-white/20" placeholder={activeKeyId ? "COMMAND LINE" : "SCAN KEY TO UNLOCK"} />
            <button onClick={startListening} className={`p-3 rounded-xl hover:bg-white/10 ${isListening ? 'text-red-500 animate-pulse' : ''}`}><Mic className="w-6 h-6 opacity-70" /></button>
            <button onClick={() => checkGmail()} className="p-3 rounded-xl hover:bg-white/10"><Mail className="w-6 h-6 opacity-70"/></button>
          </div>
        </>
      )}
      {showAdmin && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl p-8 flex flex-col gap-4 animate-in slide-in-from-bottom duration-300 overflow-y-auto">
          <div className="flex justify-between items-center text-white mb-4">
            <button onClick={() => setShowAdmin(false)} className="flex items-center gap-2 text-xs uppercase opacity-70 hover:opacity-100"><ChevronLeft className="w-4 h-4"/> BACK</button>
            <h2 className="text-xl font-bold flex items-center gap-2"><Database/> NEURAL CONFIG</h2>
            <button onClick={() => setShowKeys(!showKeys)} className="p-2 hover:text-amber-500">{showKeys ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
          </div>
          <div className="p-4 border border-red-500/30 bg-red-500/10 rounded-lg mb-4">
            <label className="text-[10px] uppercase text-red-400 font-bold mb-2 block">DEV OVERRIDE</label>
            <button onClick={() => { setActiveKeyId("dev-override"); setInterfaceMode("LAB"); setShowAdmin(false); }} className="w-full py-3 border border-red-500/50 text-red-300 font-bold uppercase tracking-widest rounded flex items-center justify-center gap-2"><Unlock className="w-4 h-4" /> FORCE UNLOCK LAB</button>
          </div>
          <label className="text-[10px] uppercase opacity-40 font-bold tracking-widest block">VOICE ENGINE</label>
          <input type={showKeys ? "text" : "password"} value={xiKey} onChange={(e) => { setXiKey(e.target.value); localStorage.setItem("XI_KEY", e.target.value); }} className="w-full bg-white/5 p-3 rounded text-xs font-mono" placeholder="ElevenLabs Key" />
          <input type={showKeys ? "text" : "password"} value={xiVoice} onChange={(e) => { setXiVoice(e.target.value); localStorage.setItem("XI_VOICE", e.target.value); }} className="w-full bg-white/5 p-3 rounded text-xs font-mono" placeholder="Voice ID" />
          <label className="text-[10px] uppercase opacity-40 font-bold tracking-widest block mt-4">BRAIN MATRIX</label>
          <input type={showKeys ? "text" : "password"} value={geminiKey} onChange={(e) => { setGeminiKey(e.target.value); localStorage.setItem("GEMINI_KEY", e.target.value); }} className="w-full bg-white/5 p-3 rounded text-xs font-mono" placeholder="Gemini Key" />
          <input type={showKeys ? "text" : "password"} value={claudeKey} onChange={(e) => { setClaudeKey(e.target.value); localStorage.setItem("CLAUDE_KEY", e.target.value); }} className="w-full bg-white/5 p-3 rounded text-xs font-mono" placeholder="Claude Key" />
          <input type={showKeys ? "text" : "password"} value={openaiKey} onChange={(e) => { setOpenaiKey(e.target.value); localStorage.setItem("OPENAI_KEY", e.target.value); }} className="w-full bg-white/5 p-3 rounded text-xs font-mono" placeholder="OpenAI Key" />
          <input type={showKeys ? "text" : "password"} value={grokKey} onChange={(e) => { setGrokKey(e.target.value); localStorage.setItem("GROK_KEY", e.target.value); }} className="w-full bg-white/5 p-3 rounded text-xs font-mono" placeholder="Grok Key" />
          <label className="text-[10px] uppercase opacity-40 font-bold tracking-widest block mt-4">CONNECTIVITY</label>
          <input type={showKeys ? "text" : "password"} value={googleClientId} onChange={(e) => { setGoogleClientId(e.target.value); localStorage.setItem("GOOGLE_CLIENT_ID", e.target.value); }} className="w-full bg-white/5 p-3 rounded text-xs font-mono" placeholder="Google Client ID" />
        </div>
      )}
    </div>
  );
}
