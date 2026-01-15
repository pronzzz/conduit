import useGameStore from '../store/useStore';

export const PropertiesPanel = () => {
    const selectedNodeId = useGameStore(state => state.selectedNodeId);
    const nodes = useGameStore(state => state.nodes);
    const updateNode = useGameStore(state => state.updateNode);

    const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

    if (!selectedNode) {
        return (
            <div className="w-80 bg-slate-800 border-l border-slate-700 p-6 flex flex-col gap-4 text-slate-400">
                <h2 className="text-xl font-bold text-white mb-4">Properties</h2>
                <p className="italic">Select a node to view properties</p>
            </div>
        );
    }

    const { type, config } = selectedNode;

    const handleChange = (key: string, value: string) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;

        updateNode(selectedNode.id, {
            config: {
                ...config,
                [key]: numValue
            }
        });
    };

    return (
        <div className="w-80 bg-slate-800 border-l border-slate-700 p-6 flex flex-col gap-6 overflow-y-auto">
            <div>
                <h2 className="text-xl font-bold text-white mb-1">Properties</h2>
                <div className="text-emerald-400 font-mono text-sm">{type}</div>
                <div className="text-slate-500 text-xs mt-1">{selectedNode.id}</div>
            </div>

            <div className="flex flex-col gap-4">
                {/* Specific Fields based on Type */}

                {type === 'CLIENT' && (
                    <div className="flex flex-col gap-2">
                        <label className="text-slate-300 text-sm font-medium">Requests Per Second (RPS)</label>
                        <input
                            type="number"
                            className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                            value={config.rps || 0}
                            onChange={(e) => handleChange('rps', e.target.value)}
                        />
                    </div>
                )}

                {type === 'SERVER' && (
                    <div className="flex flex-col gap-2">
                        <label className="text-slate-300 text-sm font-medium">Capacity (Concurrent)</label>
                        <input
                            type="number"
                            className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                            value={config.capacity || 0}
                            onChange={(e) => handleChange('capacity', e.target.value)}
                        />
                        <div className="text-xs text-slate-500">Max parallel requests before failing.</div>
                    </div>
                )}

                {type === 'DATABASE' && (
                    <div className="flex flex-col gap-2">
                        <label className="text-slate-300 text-sm font-medium">Latency (ms)</label>
                        <input
                            type="number"
                            className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                            value={config.latency || 0}
                            onChange={(e) => handleChange('latency', e.target.value)}
                        />
                        <div className="text-xs text-slate-500">Time to process each query.</div>
                    </div>
                )}

                {type === 'CACHE' && (
                    <div className="flex flex-col gap-2">
                        <label className="text-slate-300 text-sm font-medium">Hit Rate (0.0 - 1.0)</label>
                        <input
                            type="number"
                            step="0.1"
                            max="1"
                            min="0"
                            className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                            value={config.hitRate || 0}
                            onChange={(e) => handleChange('hitRate', e.target.value)}
                        />
                        <div className="text-xs text-slate-500">Probability of serving request immediately.</div>
                    </div>
                )}

                {/* Common / Debug Props */}
                <div className="pt-6 border-t border-slate-700">
                    <h3 className="text-slate-400 text-xs uppercase font-bold mb-3">Live Stats</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900 p-3 rounded">
                            <div className="text-slate-500 text-xs">Load</div>
                            <div className="text-white font-mono">{selectedNode.state.currentLoad}</div>
                        </div>
                        <div className="bg-slate-900 p-3 rounded">
                            <div className="text-slate-500 text-xs">Health</div>
                            <div className={`font-mono ${selectedNode.state.health < 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {selectedNode.state.health}%
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
