import React from 'react';
import { Delete } from 'lucide-react';

interface KeypadProps {
  onKeyPress: (val: string) => void;
}

export function Keypad({ onKeyPress }: KeypadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'clear'];

  return (
    <div className="grid grid-cols-3 gap-4">
      {keys.map((key, i) => {
        if (key === '') return <div key={i} />;
        
        return (
          <button
            key={i}
            onClick={() => onKeyPress(key)}
            className={`h-16 flex items-center justify-center rounded-xl text-xl font-semibold transition-all active:scale-95 ${
              key === 'clear' 
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                : 'bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-100'
            }`}
          >
            {key === 'clear' ? <Delete /> : key}
          </button>
        );
      })}
    </div>
  );
}
