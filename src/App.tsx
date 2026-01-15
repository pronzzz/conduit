import { Toolbar } from './components/Toolbar';
import { GameCanvas } from './components/GameCanvas';
import { PropertiesPanel } from './components/PropertiesPanel';

function App() {
  return (
    <div className="w-screen h-screen flex bg-slate-950 text-white overflow-hidden">
      <Toolbar />
      <main className="flex-1 relative">
        <GameCanvas />
      </main>
      <PropertiesPanel />
    </div>
  );
}

export default App;
