import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Line, Text, Group } from 'react-konva';
import Konva from 'konva';
import useGameStore from '../store/useStore';
import { useGameLoop } from '../engine/useGameLoop';
import { v4 as uuidv4 } from 'uuid';
import type { NodeType } from '../types';
import { ParticleOverlay } from './ParticleOverlay';

export const GameCanvas = () => {
    // Start the physics loop
    useGameLoop();

    const nodes = useGameStore(state => state.nodes);
    const edges = useGameStore(state => state.edges);
    const isPlaying = useGameStore(state => state.isPlaying);
    const setIsPlaying = useGameStore(state => state.setIsPlaying);
    const addNode = useGameStore(state => state.addNode);
    const updateNode = useGameStore(state => state.updateNode);

    // Selection & Edge Logic
    const selectedNodeId = useGameStore(state => state.selectedNodeId);
    const selectNode = useGameStore(state => state.selectNode);
    const addEdge = useGameStore(state => state.addEdge);

    const stageRef = useRef<Konva.Stage>(null);
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

    // Viewport State
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [stageScale, setStageScale] = useState(1);

    // Handle Resize
    useEffect(() => {
        const handleResize = () => {
            setDimensions({ width: window.innerWidth, height: window.innerHeight });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- Drag & Drop from Toolbar ---
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('nodeType') as NodeType;
        if (!type || !stageRef.current) return;

        // Get pointer position relative to stage
        const stage = stageRef.current;
        stage.setPointersPositions(e);
        const pointerPosition = stage.getPointerPosition();

        if (!pointerPosition) return;

        // Apply inverse transform to get 'world' coordinates
        // worldX = (pointerX - stageX) / stageScale
        const x = (pointerPosition.x - stagePos.x) / stageScale;
        const y = (pointerPosition.y - stagePos.y) / stageScale;

        const newNode = {
            id: uuidv4(),
            type,
            x,
            y,
            config: {
                capacity: type === 'SERVER' ? 5 : undefined,
                latency: type === 'DATABASE' ? 200 : (type === 'SERVER' ? 50 : 0),
                rps: type === 'CLIENT' ? 1 : undefined,
                hitRate: type === 'CACHE' ? 0.8 : undefined
            },
            state: { currentLoad: 0, health: 100 }
        };

        addNode(newNode);
    };

    // --- Zoom (Wheel) ---
    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const scaleBy = 1.1;
        const stage = e.target.getStage();
        if (!stage) return;

        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

        // Limit scale
        if (newScale < 0.2 || newScale > 5) return;

        setStageScale(newScale);
        setStagePos({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        });
    };

    // --- Node Dragging ---
    const handleNodeDragEnd = (e: Konva.KonvaEventObject<DragEvent>, nodeId: string) => {
        updateNode(nodeId, {
            x: e.target.x(),
            y: e.target.y()
        });
    };

    // --- Node Click (Selection & Connection) ---
    const handleNodeClick = (e: Konva.KonvaEventObject<MouseEvent>, nodeId: string) => {
        e.cancelBubble = true; // Prevent stage click

        if (!selectedNodeId) {
            // Select first node
            selectNode(nodeId);
        } else {
            // Second node clicked
            if (selectedNodeId === nodeId) {
                // Deselect if same
                selectNode(null);
            } else {
                // Connect!
                const newEdge = {
                    id: uuidv4(),
                    sourceNodeId: selectedNodeId,
                    targetNodeId: nodeId
                };
                addEdge(newEdge);
                selectNode(null); // Reset selection
            }
        }
    };

    const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
        // Deselect if clicked on empty stage
        if (e.target === stageRef.current) {
            selectNode(null);
        }
    };

    return (
        <div
            className="relative w-full h-full bg-slate-900 overflow-hidden"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            {/* Konva Layer for Nodes/Edges (Static/Interactive) */}
            <Stage
                width={dimensions.width}
                height={dimensions.height}
                onWheel={handleWheel}
                scaleX={stageScale}
                scaleY={stageScale}
                x={stagePos.x}
                y={stagePos.y}
                draggable
                ref={stageRef}
                onClick={handleStageClick}
                onDragEnd={(e) => {
                    // Stage drag end (pan)
                    if (e.target === stageRef.current) {
                        setStagePos({ x: e.target.x(), y: e.target.y() });
                    }
                }}
            >
                <Layer>
                    {/* Edges */}
                    {edges.map(edge => {
                        const source = nodes.find(n => n.id === edge.sourceNodeId);
                        const target = nodes.find(n => n.id === edge.targetNodeId);
                        if (!source || !target) return null;
                        return (
                            <Line
                                key={edge.id}
                                points={[source.x, source.y, target.x, target.y]}
                                stroke="#475569" // slate-600
                                strokeWidth={4}
                                lineCap="round"
                            />
                        );
                    })}

                    {/* Nodes */}
                    {nodes.map(node => (
                        <Group
                            key={node.id}
                            x={node.x}
                            y={node.y}
                            draggable
                            onDragEnd={(e) => handleNodeDragEnd(e, node.id)}
                            onClick={(e) => handleNodeClick(e, node.id)}
                        >
                            {/* Node Body */}
                            <Rect
                                x={-30}
                                y={-30}
                                width={60}
                                height={60}
                                fill={
                                    // Health tint logic (if health < 50, tint red)
                                    node.state.health < 50
                                        ? '#ef4444' // red-500
                                        : (node.type === 'CLIENT' ? '#3b82f6' : (node.type === 'SERVER' ? '#6366f1' : (node.type === 'DATABASE' ? '#10b981' : (node.type === 'LOAD_BALANCER' ? '#a855f7' : '#f59e0b'))))
                                }
                                cornerRadius={8}
                                shadowColor="black"
                                shadowBlur={10}
                                shadowOpacity={0.3}
                                stroke={selectedNodeId === node.id ? '#fbbf24' : undefined} // Yellow highlight
                                strokeWidth={selectedNodeId === node.id ? 4 : 0}
                            />
                            {/* Label */}
                            <Text
                                x={-40}
                                y={35}
                                text={node.type}
                                width={80}
                                align="center"
                                fill="#e2e8f0"
                                fontSize={10}
                                fontFamily="Inter"
                            />
                            {/* Stats (Queue / Load) */}
                            {node.state.currentLoad > 0 && (
                                <Text
                                    x={-30}
                                    y={-45}
                                    text={`${node.state.currentLoad}`}
                                    width={60}
                                    align="center"
                                    fill="#fbbf24" // amber for load
                                    fontSize={10}
                                    fontStyle="bold"
                                />
                            )}
                        </Group>
                    ))}
                </Layer>
            </Stage>

            {/* Raw Canvas Layer for Particles (Animation) */}
            <ParticleOverlay
                width={dimensions.width}
                height={dimensions.height}
                stageScale={stageScale}
                stagePos={stagePos}
            />

            {/* UI Overlay */}
            <div className="absolute top-6 right-6 z-10 flex gap-4">
                <button
                    className={`px-6 py-2 rounded-full font-bold shadow-lg transition-colors ${isPlaying
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        }`}
                    onClick={() => setIsPlaying(!isPlaying)}
                >
                    {isPlaying ? 'STOP' : 'START TRAFFIC'}
                </button>

                <div className="bg-slate-800/80 backdrop-blur px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm">
                    Status: {isPlaying ? 'RUNNING' : 'PAUSED'}
                </div>

                <button
                    className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-full shadow-lg transition-colors"
                    title="Export Snapshot"
                    onClick={() => {
                        if (stageRef.current) {
                            const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
                            const link = document.createElement('a');
                            link.download = `sysarch-design-${Date.now()}.png`;
                            link.href = uri;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </button>
            </div>
        </div>
    );
};
