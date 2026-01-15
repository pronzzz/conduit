import React from 'react';
import type { NodeType } from '../types';

export const Toolbar = () => {
    const handleDragStart = (e: React.DragEvent, type: NodeType) => {
        e.dataTransfer.setData('nodeType', type);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const tools: { type: NodeType; label: string; color: string }[] = [
        { type: 'CLIENT', label: 'Client', color: 'bg-blue-500' },
        { type: 'LOAD_BALANCER', label: 'Load Balancer', color: 'bg-purple-500' },
        { type: 'SERVER', label: 'Server', color: 'bg-indigo-500' },
        { type: 'DATABASE', label: 'Database', color: 'bg-emerald-500' },
        { type: 'CACHE', label: 'Cache', color: 'bg-orange-500' },
    ];

    return (
        <div className="absolute top-0 left-0 h-full w-16 bg-slate-900 border-r border-slate-700 flex flex-col items-center py-4 gap-4 z-20 shadow-xl">
            {/* Logo Placeholder */}
            <div className="w-10 h-10 bg-slate-800 rounded-lg mb-4 flex items-center justify-center font-bold text-slate-400">
                SA
            </div>

            {tools.map((tool) => (
                <div
                    key={tool.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, tool.type)}
                    className="group relative cursor-grab active:cursor-grabbing"
                >
                    <div className={`w-10 h-10 rounded-lg ${tool.color} flex items-center justify-center shadow-lg hover:ring-2 ring-white/20 transition-all`}>
                        <span className="text-white font-bold text-xs">{tool.label[0]}</span>
                    </div>

                    {/* Tooltip */}
                    <div className="absolute left-14 top-2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {tool.label}
                    </div>
                </div>
            ))}
        </div>
    );
};
