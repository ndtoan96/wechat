import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { Transport } from 'mediasoup/node/lib/Transport';
import { Producer } from 'mediasoup/node/lib/Producer';
import { Consumer } from 'mediasoup/node/lib/Consumer';
import { createWorker } from 'mediasoup';
import { DtlsParameters, WebRtcTransportOptions } from 'mediasoup/node/lib/WebRtcTransport';
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

// Set up express app
const app = express();
app.use(cors(corsOptions));

// Create "/api" router
const apiRouter = express.Router()
apiRouter.use(express.json());
app.use("/api", apiRouter);

// Set up server and socket server
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: corsOptions,
});
httpServer.listen(port, () => {
    console.log("Listening on port", port);
});

// Interfaces declaration
interface Peer {
    socket: Socket;
    produceTransport?: Transport;
    consumeTransport?: Transport;
    producers: Producer[];
    consumers: Consumer[];
}

// Handle socket events
let peers = new Map<string, Peer>();
io.of("/room").on("connection", (socket) => {
    let peer: Peer = {
        socket: socket,
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

    // Return information of all connected peers in the room
    apiRouter.get("/peers", (_, res) => {
        let clientPeers: Array<Object> = [];
        peers.forEach((peer) => {
            const producers = peer.producers.map((p) => { p.id; });
            const consumers = peer.consumers.map((c) => { c.id; });
            clientPeers.push({
                socketId: peer.socket.id,
                produceTransportId: peer.produceTransport?.id,
                consumeTransportId: peer.consumeTransport?.id,
                producers,
                consumers,
            });
        });
        res.json(clientPeers);
    });

    // Return router rtpCapabilities
    apiRouter.get("/rtp_capabilities", (_, res) => {
        res.json(mediasoupRouter.rtpCapabilities);
    });

    // Create server side transport, then return the created transport information
    apiRouter.post("/create_transport", async (req, res) => {
        const socketId: string = req.body.socketId;
        const isSender: boolean = req.body.isSender;
        const transport = await mediasoupRouter.createWebRtcTransport(webRtcTransportOptions);
        let peer = peers.get(socketId);
        if (peer !== undefined) {
            if (isSender) {
                peer.produceTransport = transport;
            } else {
                peer.consumeTransport = transport;
            }
            res.json({
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });
        } else {
            res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
        }
    });

    // Instruct server side transport to connect with client side by providing dtls parameters
    apiRouter.post("/transport_connect", async (req, res) => {
        const socketId: string = req.body.socketId;
        const isSender: boolean = req.body.isSender;
        const dtlsParameters: DtlsParameters = req.body.dtlsParameters;
        const peer = peers.get(socketId);
        const transport = isSender ? peer?.produceTransport : peer?.consumeTransport;
        if (transport !== undefined) {
            await transport.connect({dtlsParameters});
            res.status(httpConstants.HTTP_STATUS_OK);
        } else {
            res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
        }
    })

    // Instruct server side transport to produce media, create producer and then return the its id
    apiRouter.post("/transport_produce", async (req, res) => {
        const socketId: string = req.body.socketId;
        let peer = peers.get(socketId);
        const transport = peer?.produceTransport;
        if (transport) {
            const producer = await transport.produce({
                kind: req.body.kind,
                rtpParameters: req.body.rtpParameters,
            });
            peer?.producers.push(producer);
            peer?.socket.broadcast.emit("peer-change", {event: "new-producer", socketId: peer.socket.id, producerId: producer.id});
            res.json(producer.id);
        } else {
            res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
        }
    });

    // Instruct server side transport to consume media from a producer Id, create a consumer and return its id
    apiRouter.post("/transport_consume", async (req, res) => {
        const rtpCapabilities = req.body.rtpCapabilities;
        const producerId = req.body.producerId;
        if (mediasoupRouter.canConsume({ producerId, rtpCapabilities })) {
            const socketId: string = req.body.socketId;
            let peer = peers.get(socketId);
            const transport = peer?.consumeTransport;
            if (transport) {
                const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
                peer?.consumers.push(consumer);
                res.json({
                    id: consumer.id,
                    producerId: consumer.producerId,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                });
            } else {
                res.status(httpConstants.HTTP_STATUS_NOT_FOUND);
            }
        } else {
            res.status(httpConstants.HTTP_STATUS_PRECONDITION_FAILED);
        }
    });

    // Instruct the server side consumer to pause, resume or close
    apiRouter.post("/control_consumer", (req, res) => {
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

    // Instruct the server side producer to pause, resume or close
    apiRouter.post("/control_producer", (req, res) => {
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