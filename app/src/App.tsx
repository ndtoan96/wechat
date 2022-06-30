import React from 'react';
import './App.css';
import socket from './lib/client';

socket.on("disconnect", () => {
  console.log("socket disconnected");
});

function App() {
  return (
    <div className="App">
    </div>
  );
}

export default App;
