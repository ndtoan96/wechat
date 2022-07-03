import React, { useEffect, useState } from 'react';
import './App.css';
import PeersWindows from './components/peers-windows';
import UserWindow from './components/user-window';
import { createParticipant, Participant } from './lib/client';

export const ParticipantContext = React.createContext<Participant | null>(null);

function App() {
  const [participant, setParticipant] = useState<Participant | null>(null);

  useEffect(() => {
    createParticipant({ baseUrl: "http://localhost:3001" }).then((_participant) => setParticipant(_participant));
  }, []);

  return (
    <div className="App">
      <ParticipantContext.Provider value={participant}>
        <UserWindow />
        <PeersWindows />
      </ParticipantContext.Provider>
    </div>
  );
}

export default App;
