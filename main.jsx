import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'  // Points to capitalized App.jsx
import './index.css'         // Points to renamed index.css

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)


