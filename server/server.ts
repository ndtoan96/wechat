import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Transport } from 'mediasoup/node/lib/Transport';
import { Producer } from 'mediasoup/node/lib/Producer';
import { Consumer } from 'mediasoup/node/lib/Consumer';
import { createWorker } from 'mediasoup';
import { WebRtcTransportOptions } from 'mediasoup/node/lib/WebRtcTransport';
import { constants as httpConstants } from 'http2';

const corsOptions = {
    origin: ["http://127.0.0.1:3000", "http://localhost:3000"],
};

const webRtcTransportOptions: WebRtcTransportOptions = {
    listenIps: ["127.0.0.1", "0.0.0.0"],
    enableTcp: true,
    enableUdp: true,
    preferUdp: true,
};

const port = process.env.PORT || 3002;

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: corsOptions,
});

httpServer.listen(port, () => {
    console.log("Listening on port", port);
});

interface Peer {
    socketId: string;
    produceTransport?: Transport;
    consumeTransport?: Transport;
    producers: Producer[];
    consumers: Consumer[];
}

let peers = new Map<string, Peer>();
io.of("/room").on("connection", (socket) => {
    let peer: Peer = {
        socketId: socket.id,
        producers: [],
        consumers: [],
    };
    peers.set(socket.id, peer);
    socket.broadcast.emit("peer-change", { event: "peer-join", socketId: socket.id });

    socket.on("disconnect", () => {
        peers.delete(socket.id);
        socket.broadcast.emit("peer-change", { event: "peer-left", socketId: socket.id });
        socket.disconnect();
    });
});

const init = async () => {
    const worker = await createWorker();
    const mediasoupRouter = await worker.createRouter();

    app.get("/peers", (_, res) => {
        let clientPeers: Array<Object> = [];
        peers.forEach((peer) => {
            const producers = peer.producers.map((p) => { p.id; });
            const consumers = peer.consumers.map((c) => { c.id; });
            clientPeers.push({
                socketId: peer.socketId,
                produceTransport: peer.produceTransport?.id,
                consumeTransport: peer.consumeTransport?.id,
                producers,
                consumers,
            });
        });
        res.json(clientPeers);
    });

    app.get("/rtp_capabilities", (_, res) => {
        res.json(mediasoupRouter.rtpCapabilities);
    });

    app.post("/create_transport", async (req, res) => {
        const socketId: string = req.body.socketId;
        const isSender: boolean = req.body.isSender;
        const transport = await mediasoupRouter.createWebRtcTransport(webRtcTransportOptions);
        let peer = peers.get(socketId);
        if (peer) {
            if (isSender) {
                peer.produceTransport = transport;
            } else {
                peer.consumeTransport = transport;
            }
        }
        res.json({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        });
    });

    app.post("/transport_produce", async (req, res) => {
        const socketId: string = req.body.socketId;
        let peer = peers.get(socketId);
        const transport = peer?.produceTransport;
        if (transport) {
            const producer = await transport.produce({
                kind: req.body.kind,
                rtpParameters: req.body.rtpParameters,
            });
            peer?.producers.push(producer);
            res.json(producer.id);
        } else {
            res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
        }
    });

    app.post("/transport_consume", async (req, res) => {
        const rtpCapabilities = req.body.rtpCapabilities;
        const producerId = req.body.producerId;
        if (mediasoupRouter.canConsume({ producerId, rtpCapabilities })) {
            const socketId: string = req.body.socketId;
            let peer = peers.get(socketId);
            const transport = peer?.consumeTransport;
            if (transport) {
                const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
                peer?.consumers.push(consumer);
                res.json(consumer.id);
            } else {
                res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
            }
        } else {
            res.status(httpConstants.HTTP_STATUS_PRECONDITION_FAILED);
        }
    });

    app.post("/control_consumer", (req, res) => {
        const socketId: string = req.body.socketId;
        const consumerId: string = req.body.consumerId;
        const action: "pause" | "resume" | "close" = req.body.action;
        let peer = peers.get(socketId);
        if (peer) {
            let found = false;
            peer.consumers.forEach((consumer) => {
                if (consumer.id === consumerId) {
                    found = true;
                    switch(action) {
                        case "pause": {
                            consumer.pause();
                            break;
                        }
                        case "resume": {
                            consumer.resume();
                            break;
                        }
                        case "close": {
                            consumer.close();
                            break;
                        }
                        default: {
                            res.status(httpConstants.HTTP_STATUS_BAD_REQUEST);
                            return;
                        }
                    }
                }
            });
            if (found) {
                res.status(httpConstants.HTTP_STATUS_OK);
            } else {
                res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
            }
        } else {
            res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
        }
    });

    app.post("/control_producer", (req, res) => {
        const socketId: string = req.body.socketId;
        const producerId: string = req.body.producerId;
        const action: "pause" | "resume" | "close" = req.body.action;
        let peer = peers.get(socketId);
        if (peer) {
            let found = false;
            peer.producers.forEach((producer) => {
                if (producer.id === producerId) {
                    found = true;
                    switch(action) {
                        case "pause": {
                            producer.pause();
                            break;
                        }
                        case "resume": {
                            producer.resume();
                            break;
                        }
                        case "close": {
                            producer.close();
                            break;
                        }
                        default: {
                            res.status(httpConstants.HTTP_STATUS_BAD_REQUEST);
                            return;
                        }
                    }
                }
            });
            if (found) {
                res.status(httpConstants.HTTP_STATUS_OK);
            } else {
                res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
            }
        } else {
            res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
        }
    });
};

init();