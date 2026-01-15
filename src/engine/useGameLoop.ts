import { useEffect, useRef } from 'react';
import useGameStore from '../store/useStore';
import { v4 as uuidv4 } from 'uuid';
import type { RequestParticle, Node, Edge } from '../types';

export const useGameLoop = () => {
    // We only enable/disable loop based on isPlaying, so directly check state in loop.

    const lastFrameTime = useRef<number>(0);
    const animationFrameId = useRef<number | null>(null);

    // Helper to spawn particles
    const spawnParticles = (dt: number, currentNodes: Node[], currentEdges: Edge[]) => {
        const newParticles: RequestParticle[] = [];

        currentNodes.forEach(node => {
            if (node.type === 'CLIENT' && node.config.rps) {
                // Simple logic: 1 RPS = 1 particle per second.
                // Probability spawn: chance = rps * dt (dt in seconds)
                // Better: Accumulator. For now, using probability for simplicity of MVP.
                const chance = node.config.rps * (dt / 1000);
                if (Math.random() < chance) {
                    // Find connected edge source -> target
                    const edge = currentEdges.find(e => e.sourceNodeId === node.id);
                    if (edge) {
                        newParticles.push({
                            id: uuidv4(),
                            x: node.x,
                            y: node.y,
                            sourceNodeId: node.id,
                            targetNodeId: edge.targetNodeId,
                            originNodeId: node.id,
                            status: 'PENDING',
                            progress: 0,
                            isResponse: false,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        });

        return newParticles;
    };

    const updatePhysics = (time: number) => {
        if (!lastFrameTime.current) {
            lastFrameTime.current = time;
            animationFrameId.current = requestAnimationFrame(updatePhysics);
            return;
        }

        const dt = time - lastFrameTime.current;
        lastFrameTime.current = time;

        // Direct store access to avoid closure staleness if not using refs, 
        // but here we simply rely on the hook re-running if deps change, 
        // OR better: useStore.getState inside access if we want to run outside React render cycle.
        // However, since we are inside React component, we can use the props.
        // Wait, if we use props from `useGameStore()` in dependency array, passing them to loop?
        // Actually, `useGameStore` hooks trigger re-renders. 
        // Ideally, the loop logic should run independently or access fresh state via getState.

        // Access fresh state
        const state = useGameStore.getState();
        if (!state.isPlaying) {
            animationFrameId.current = requestAnimationFrame(updatePhysics);
            return;
        }

        let nextParticles = [...state.particles];

        // 1. Spawn
        const spawned = spawnParticles(dt, state.nodes, state.edges);
        nextParticles.push(...spawned);

        // 2. Move & Process
        nextParticles = nextParticles.map(p => {
            // Calculate speed. Arbitrary: traverse edge in 2 seconds?
            // Or speed = pixels/sec?
            // PRD says: "Move: Update x,y ... based on progress".
            // Let's say traverse time is 2000ms by default for visual.
            const traverseTime = 2000;
            const deltaProgress = dt / traverseTime;

            // Update progress
            let newProgress = p.progress + deltaProgress;

            // Find positions
            let sourceNode: Node | undefined, targetNode: Node | undefined;

            if (p.isResponse) {
                // Returning: Target is actually the sourceNodeId (where it came from)
                // Source is the targetNodeId (where it was processed)
                // Wait, logic in PRD: "Send back to Source (Response)"
                // My type: sourceNodeId is "Where it came from". targetNodeId is "Where it's going".
                // So source and target in the particle struct are STATIC for the request leg?
                // Or do we swap them?
                // Let's swap them conceptually or explicit fields.
                // PRD 3.3.4: "Send back to Source".
                // Implementation: I'll stick to: targetNodeId is ALWAYS the immediate destination.
                sourceNode = state.nodes.find(n => n.id === p.sourceNodeId);
                targetNode = state.nodes.find(n => n.id === p.targetNodeId);
            } else {
                sourceNode = state.nodes.find(n => n.id === p.sourceNodeId);
                targetNode = state.nodes.find(n => n.id === p.targetNodeId);
            }

            if (!sourceNode || !targetNode) return p; // Should not happen

            if (newProgress >= 1) {
                // Arrived at destination node
                if (!p.isResponse) {
                    // REQUEST Arrived at Target

                    // Logic: CACHE
                    if (targetNode.type === 'CACHE') {
                        const hitRate = targetNode.config.hitRate ?? 0.8;
                        const isHit = Math.random() < hitRate;

                        if (isHit) {
                            // CACHE HIT: Return immediately
                            return {
                                ...p,
                                isResponse: true,
                                progress: 0,
                                sourceNodeId: p.targetNodeId, // Now coming from Cache
                                targetNodeId: p.sourceNodeId  // Going back to source
                            };
                        } else {
                            // CACHE MISS: Forward to Database (if connected)
                            const outgoingEdges = state.edges.filter(e => e.sourceNodeId === targetNode!.id);
                            if (outgoingEdges.length > 0) {
                                // For now, just pick first or random (assuming 1 DB usually)
                                const nextEdge = outgoingEdges[0];
                                return {
                                    ...p,
                                    sourceNodeId: targetNode.id,
                                    targetNodeId: nextEdge.targetNodeId,
                                    progress: 0
                                };
                            } else {
                                // Miss but nowhere to go? Treat as hit/return or error? 
                                // Return as miss (slow?) or error. Let's return as response.
                                return {
                                    ...p,
                                    isResponse: true,
                                    progress: 0,
                                    sourceNodeId: p.targetNodeId,
                                    targetNodeId: p.sourceNodeId
                                };
                            }
                        }
                    }

                    // Logic: LOAD BALANCER
                    if (targetNode.type === 'LOAD_BALANCER') {
                        const outgoingEdges = state.edges.filter(e => e.sourceNodeId === targetNode!.id);
                        if (outgoingEdges.length > 0) {
                            const nextEdge = outgoingEdges[Math.floor(Math.random() * outgoingEdges.length)];
                            return {
                                ...p,
                                sourceNodeId: targetNode.id,
                                targetNodeId: nextEdge.targetNodeId,
                                progress: 0
                            };
                        } else {
                            return {
                                ...p,
                                isResponse: true,
                                status: 'ERROR',
                                progress: 0,
                                sourceNodeId: p.targetNodeId,
                                targetNodeId: p.sourceNodeId
                            };
                        }
                    }

                    // Logic: DATABASE (Latency)
                    if (targetNode.type === 'DATABASE') {
                        const latency = targetNode.config.latency ?? 200;
                        const now = Date.now();

                        // Check if we are already waiting
                        if (p.waitTimestamp) {
                            if (now >= p.waitTimestamp) {
                                // Finished waiting, turn around
                                const { waitTimestamp, ...cleanParticle } = p;
                                return {
                                    ...cleanParticle,
                                    isResponse: true,
                                    progress: 0,
                                    sourceNodeId: p.targetNodeId,
                                    targetNodeId: p.sourceNodeId
                                };
                            } else {
                                // Still waiting, keep same state (stuck at progress 1)
                                return p;
                            }
                        } else {
                            // Start waiting
                            return {
                                ...p,
                                waitTimestamp: now + latency,
                                // Keep progress at 1 so it stays visually at the node
                                progress: 1
                            };
                        }
                    }

                    // Logic: SERVER (Check Capacity -> Return)
                    // Simplified: Just turn around
                    return {
                        ...p,
                        isResponse: true,
                        progress: 0,
                        sourceNodeId: p.targetNodeId,
                        targetNodeId: p.sourceNodeId
                    };
                } else {
                    // RESPONSE Arrived at Source (Client or intermediary)

                    // If this was an intermediary (like Cache Miss return or LB return), 
                    // we need to keep routing it back to the ORIGINAL source? 
                    // Current simplified model: "Source" is always the immediate upstream.
                    // But in a chain: Client -> LB -> Server.
                    // Request: Client -> LB.
                    // Request: LB -> Server.
                    // Response: Server -> LB.
                    // We need logic here: If Response arrives at LB, it should forward to Client?

                    // This implies we need to track the "Call Stack" or "Original Source".
                    // For Phase 1-3 simplified: The "target" of the response IS the random node it came from.
                    // If connection is bi-directional or we just look for upstream edges?

                    // No, particles store source/target.
                    // When Server -> LB (Response), p.targetNodeId is LB.
                    // When it hits LB, LB needs to send it to Client.

                    if (targetNode.type === 'LOAD_BALANCER' || targetNode.type === 'CACHE') {
                        // Pass-through response Logic
                        // We need to find where this request likely came from.
                        // Issue: We don't know which Client sent it if multiple connected.
                        // Solution for stateless: Random upstream? Or store `originalSource` in particle.
                        // Let's rely on finding *an* incoming edge to this node and sending it back there.

                        const incomingEdges = state.edges.filter(e => e.targetNodeId === targetNode!.id);
                        if (incomingEdges.length > 0) {
                            const backEdge = incomingEdges[Math.floor(Math.random() * incomingEdges.length)];
                            return {
                                ...p,
                                sourceNodeId: targetNode.id,
                                targetNodeId: backEdge.sourceNodeId,
                                progress: 0
                            };
                        }
                        // If no upstream, it dies here.
                        return null;
                    }

                    // If it arrived at CLIENT, it's done.
                    return null;
                }
            }

            // Interpolate Position
            const newX = sourceNode.x + (targetNode.x - sourceNode.x) * newProgress;
            const newY = sourceNode.y + (targetNode.y - sourceNode.y) * newProgress;

            return {
                ...p,
                progress: newProgress,
                x: newX,
                y: newY
            } as RequestParticle;
        }).filter(Boolean) as RequestParticle[];

        // Batch update
        useGameStore.getState().setParticles(nextParticles);

        animationFrameId.current = requestAnimationFrame(updatePhysics);
    };

    useEffect(() => {
        animationFrameId.current = requestAnimationFrame(updatePhysics);
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, []); // Run once on mount
};
