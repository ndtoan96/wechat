import io from 'socket.io-client';

const socket = io("http://localhost:3002");
socket.on("connect", () => {
    console.log("socket connected");
});

export default socket;