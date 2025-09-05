import React from 'react';
import { ShadeConfigurator } from './components/ShadeConfigurator';
import './index.css';

function App() {
  console.log('🚀 App component is rendering - this should appear in console');
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <ShadeConfigurator />
    </div>
  );
}

export default App;