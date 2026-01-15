import { create } from 'zustand';
import type { GameState, Node, Edge, RequestParticle } from '../types';

interface GameStore extends GameState {
    // Selection State
    selectedNodeId: string | null;
    selectNode: (id: string | null) => void;

    // Actions
    addNode: (node: Node) => void;
    updateNode: (id: string, updates: Partial<Node>) => void;
    addEdge: (edge: Edge) => void;
    removeNode: (id: string) => void;
    removeEdge: (id: string) => void;

    // Simulation Actions
    setIsPlaying: (isPlaying: boolean) => void;
    setParticles: (particles: RequestParticle[]) => void;
    addParticle: (particle: RequestParticle) => void;
    removeParticle: (id: string) => void;
}

const useGameStore = create<GameStore>((set) => ({
    nodes: [
        {
            id: 'client-1',
            type: 'CLIENT',
            x: 100,
            y: 300,
            config: { rps: 1 },
            state: { currentLoad: 0, health: 100 }
        },
        {
            id: 'server-1',
            type: 'SERVER',
            x: 500,
            y: 300,
            config: { capacity: 5, latency: 1000 }, // 1s latency for visibility
            state: { currentLoad: 0, health: 100 }
        }
    ],
    edges: [
        { id: 'edge-1', sourceNodeId: 'client-1', targetNodeId: 'server-1' }
    ],
    particles: [],
    isPlaying: false, // Start paused
    tickRate: 1,

    selectedNodeId: null,

    selectNode: (id) => set({ selectedNodeId: id }),

    addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
    updateNode: (id, updates) => set((state) => ({
        nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n))
    })),
    addEdge: (edge) => set((state) => {
        // Prevent duplicates
        const exists = state.edges.some(e => e.sourceNodeId === edge.sourceNodeId && e.targetNodeId === edge.targetNodeId);
        if (exists) return state;
        return { edges: [...state.edges, edge] };
    }),
    removeNode: (id) => set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) })),
    removeEdge: (id) => set((state) => ({ edges: state.edges.filter((e) => e.id !== id) })),

    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setParticles: (particles) => set({ particles }),
    addParticle: (particle) => set((state) => ({ particles: [...state.particles, particle] })),
    removeParticle: (id) => set((state) => ({ particles: state.particles.filter((p) => p.id !== id) })),
}));

export default useGameStore;
