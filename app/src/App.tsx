import React from 'react';
import './App.css';
import PeersWindows from './components/peers-windows';
import UserWindow from './components/user-window';
import { createParticipant, Participant } from './lib/client';

let participant: Participant | null = null;
async function init() {
  participant = await createParticipant({ baseUrl: "http://localhost:3002" });
  // const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  // const track = stream.getTracks()[0];
  // const producer = await participant.produceMedia({ track });
  // track.stop();
}
init();

export const AppContext = React.createContext<Participant | null>(null);

function App() {
  return (
    <div className="App">
      <AppContext.Provider value={participant}>
        <UserWindow />
        <PeersWindows />
      </AppContext.Provider>
    </div>
  );
}

export default App;
