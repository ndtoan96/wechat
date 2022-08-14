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
import { RouterOptions } from 'mediasoup/node/lib/Router';

const corsOptions = {
    origin: "*",
};

const webRtcTransportOptions: WebRtcTransportOptions = {
    listenIps: [{ip: "0.0.0.0", announcedIp: process.env.HOST_PUBLIC_IP || "127.0.0.1"}],
    enableTcp: true,
    enableUdp: true,
    preferUdp: true,
};

const routerOptions: RouterOptions = {
    mediaCodecs: [
        {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2
        },
        {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters:
            {
                'x-google-start-bitrate': 1000
            }
        },
        {
            kind: 'video',
            mimeType: 'video/VP9',
            clockRate: 90000,
            parameters:
            {
                'profile-id': 2,
                'x-google-start-bitrate': 1000
            }
        },
        {
            kind: 'video',
            mimeType: 'video/h264',
            clockRate: 90000,
            parameters:
            {
                'packetization-mode': 1,
                'profile-level-id': '4d0032',
                'level-asymmetry-allowed': 1,
                'x-google-start-bitrate': 1000
            }
        },
        {
            kind: 'video',
            mimeType: 'video/h264',
            clockRate: 90000,
            parameters:
            {
                'packetization-mode': 1,
                'profile-level-id': '42e01f',
                'level-asymmetry-allowed': 1,
                'x-google-start-bitrate': 1000
            }
        }
    ]
};

const port = process.env.PORT || 3001;

// Set up express app
const app = express();
app.use(cors(corsOptions));

// Serve static files
app.use(express.static("static/build"));

// Create "/api" router
const apiRouter = express.Router();
apiRouter.use(express.json());
app.use((req, res, next) => {
    res.on("finish", () => {
        console.log(`${req.method} ${req.url} | Status: ${res.statusCode} ${res.statusMessage}`);
    });
    next();
});
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
    console.log("New socket connected", socket.id);
    let peer: Peer = {
        socket: socket,
        producers: [],
        consumers: [],
    };
    peers.set(socket.id, peer);
    socket.broadcast.emit("peer-change", { event: "peer-join", socketId: socket.id });

    socket.on("disconnect", () => {
        console.log("Socket disconnected", socket.id);
        peers.delete(socket.id);
        socket.broadcast.emit("peer-change", { event: "peer-left", socketId: socket.id });
        socket.disconnect();
    });
});

const init = async () => {
    const worker = await createWorker({
        rtcMaxPort: 2020,
        rtcMinPort: 2000,
    });
    const mediasoupRouter = await worker.createRouter(routerOptions);

    // Return information of all connected peers in the room
    apiRouter.get("/peers", (_, res) => {
        let clientPeers: Array<Object> = [];
        peers.forEach((peer) => {
            const producers = peer.producers.map((p) => { return p.id; });
            const consumers = peer.consumers.map((c) => { return c.id; });
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
            res.sendStatus(httpConstants.HTTP_STATUS_NOT_FOUND);
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
            await transport.connect({ dtlsParameters });
            res.sendStatus(httpConstants.HTTP_STATUS_OK);
        } else {
            res.sendStatus(httpConstants.HTTP_STATUS_NOT_FOUND);
        }
    });

    // Instruct server side transport to produce media, create producer and then return the its id
    apiRouter.post("/transport_produce", async (req, res) => {
        const socketId: string = req.body.socketId;
        let peer = peers.get(socketId);
        const transport = peer?.produceTransport;
        if (peer !== undefined && transport !== undefined) {
            const producer = await transport.produce({
                kind: req.body.kind,
                rtpParameters: req.body.rtpParameters,
            });
            peer.producers.push(producer);
            peer.socket.broadcast.emit("peer-change", { event: "new-producer", socketId: peer.socket.id, producerId: producer.id });
            res.json(producer.id);
        } else {
            res.sendStatus(httpConstants.HTTP_STATUS_NOT_FOUND);
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
                res.sendStatus(httpConstants.HTTP_STATUS_NOT_FOUND);
            }
        } else {
            res.sendStatus(httpConstants.HTTP_STATUS_PRECONDITION_FAILED);
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
                    switch (action) {
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
                            res.sendStatus(httpConstants.HTTP_STATUS_BAD_REQUEST);
                            return;
                        }
                    }
                }
            });
            if (found) {
                res.sendStatus(httpConstants.HTTP_STATUS_OK);
            } else {
                res.sendStatus(httpConstants.HTTP_STATUS_NOT_FOUND);
            }
        } else {
            res.sendStatus(httpConstants.HTTP_STATUS_NOT_FOUND);
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
                    switch (action) {
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
                            res.sendStatus(httpConstants.HTTP_STATUS_BAD_REQUEST);
                            return;
                        }
                    }
                }
            });
            if (found) {
                res.sendStatus(httpConstants.HTTP_STATUS_OK);
            } else {
                res.sendStatus(httpConstants.HTTP_STATUS_NOT_FOUND);
            }
        } else {
            res.sendStatus(httpConstants.HTTP_STATUS_NOT_FOUND);
        }
    });
};

init();