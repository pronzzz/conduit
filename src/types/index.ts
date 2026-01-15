export type NodeType = 'CLIENT' | 'LOAD_BALANCER' | 'SERVER' | 'DATABASE' | 'CACHE';

export interface Node {
    id: string;
    type: NodeType;
    x: number;
    y: number;
    config: {
        capacity?: number;   // Max concurrent requests (for servers)
        latency?: number;    // Ms to process
        strategy?: 'ROUND_ROBIN' | 'LEAST_CONN'; // For LBs
        rps?: number;        // For Clients
        hitRate?: number;    // For Caches (0-1)
    };
    state: {
        currentLoad: number; // Active requests
        health: number;      // 0-100
    };
}

export interface Edge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
}

export interface RequestParticle {
    id: string;
    x: number;
    y: number;
    targetNodeId: string; // Where it's going
    sourceNodeId: string; // Where it came from (for response)
    originNodeId: string; // The original client who sent it
    status: 'PENDING' | 'SUCCESS' | 'ERROR';
    progress: number; // 0.0 to 1.0 along the edge
    isResponse: boolean; // True if returning to source
    timestamp: number;
    waitTimestamp?: number;
}

export interface GameState {
    nodes: Node[];
    edges: Edge[];
    particles: RequestParticle[];
    isPlaying: boolean;
    tickRate: number; // Multiplier, 1.0 = real time
}
