# SysArch Interactive - User Guide

This guide provides an in-depth explanation of how to use **SysArch Interactive** to simulate various system design scenarios.

## 1. Interface Overview

### The Canvas
The central area is an **infinite grid**.
- **Pan**: Click and drag on empty space to move the view.
- **Zoom**: Use your mouse wheel to zoom in and out.

### The Toolbar (Left)
Contains the palette of available components. Drag these onto the canvas to add them.
- **Client**: The source of traffic.
- **Load Balancer**: Distributes traffic to connected nodes.
- **Server**: The workhorse; processes requests.
- **Database**: Stores data; simulates I/O latency.
- **Cache**: Stores temporary data; simulates fast retrieval.

### The Properties Panel (Right)
Context-sensitive settings for the currently selected node.
- Only visible when a node is selected.
- Updates apply **immediately** to the running simulation.

### The Control Overlay (Top-Right)
- **Start/Stop Traffic**: Toggles the simulation.
- **Export**: Downloads the current view as a PNG image.

## 2. Component Reference

### Client Node
- **Role**: Emits Request particles.
- **Config**:
    - `RPS` (Requests Per Second): Controls the rate of fire. Higher RPS increases system load.
- **Behavior**: Sends particles to *all* connected downstream nodes.

### Load Balancer (LB)
- **Role**: Routes traffic.
- **Behavior**: Pick a downstream node for each incoming request.
    - Currently uses a **Random** strategy (stateless approximation of Round Robin).
- **Use Case**: Place between a Client and multiple Servers to distribute load.

### Server Node
- **Role**: Processing unit.
- **Config**:
    - `Capacity`: The maximum number of concurrent requests it can handle.
- **Behavior**: 
    - If `Current Load < Capacity`: Accepts request, "processes" it (instantly in MVP), and forwards it.
    - If `Current Load >= Capacity`: Becomes Overloaded (Turns Red).

### Database Node (DB)
- **Role**: Data storage.
- **Config**:
    - `Latency`: Simulated delay in milliseconds (ms).
- **Behavior**: 
    - Incoming requests are held at the node for `Latency` ms.
    - After the delay, they are forwarded (or returned as response).
- **Visuals**: You will see particles "stuck" at the DB node while they wait.

### Cache Node
- **Role**: fast data retrieval.
- **Config**:
    - `Hit Rate`: Probability (0.0 - 1.0) of a "Hit".
- **Behavior**:
    - **Hit**: Returns a Response particle immediately to the source.
    - **Miss**: Forwards the Request particle to a downstream node (usually a DB).

## 3. Common Scenarios to Try

### Bottleneck Analysis
1.  Connect **Client -> Server**.
2.  Set Client `RPS` to 5.
3.  Set Server `Capacity` to 2.
4.  **Observe**: The Server will turn red and potentially fail requests as the queue builds up.

### Database Latency Impact
1.  Connect **Client -> Server -> Database**.
2.  Set Database `Latency` to 2000ms (2 seconds).
3.  **Observe**: Requests stack up at the Database. The entire system throughput slows down.

### Caching Strategy
1.  Modify the above: **Client -> Server -> Cache -> Database**.
2.  Set Cache `Hit Rate` to 0.9 (90%).
3.  **Observe**: Only ~10% of requests now reach the slow Database. The system becomes much more responsive.

### Load Balancing
1.  Connect **Client -> LB**.
2.  Connect **LB -> Server A** and **LB -> Server B**.
3.  **Observe**: Traffic is split between the two servers, allowing higher total throughput than a single server.
