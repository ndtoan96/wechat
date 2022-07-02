import { Device } from 'mediasoup-client';
import { ConsumerOptions } from 'mediasoup-client/lib/Consumer';
import { ProducerOptions } from 'mediasoup-client/lib/Producer';
import { Transport, TransportOptions } from 'mediasoup-client/lib/Transport';
import io, { Socket } from 'socket.io-client';

export interface InitOptions {
    baseUrl: string;
}

export interface PeerData {
    socketId: string,
    produceTransportId?: string,
    consumeTransportId?: string,
    producers: string[],
    consumers: string[],
}

export class Participant {
    constructor(
        private baseUrl: string,
        public socket: Socket,
        public device: Device,
        public sendTransport: Transport,
        public recvTransport: Transport,
    ) { }

    async produceMedia(options?: ProducerOptions) {
        const producer = await this.sendTransport.produce(options);
        return producer;
    }

    async consumeMedia(producerId: string) {
        const res = await fetch(`${this.baseUrl}/api/transport_consume`, {
            method: "POST",
            body: JSON.stringify({
                socketId: this.socket.id,
                producerId: producerId,
                rtpCapabilities: this.device.rtpCapabilities,
            })
        });
        handleResponseStatus(res);
        const consumerOptions: ConsumerOptions = await res.json();
        const consumer = await this.recvTransport.consume({ ...consumerOptions });
        return consumer;
    }

    async getPeers() {
        const res = await fetch(`${this.baseUrl}/api/peers`);
        handleResponseStatus(res);
        const peers: PeerData[] = await res.json();
        return peers;
    }
}

export const createParticipant = async (options?: InitOptions) => {
    const baseUrl = options?.baseUrl || "";

    // Init client socket
    const socket = io(`${baseUrl}/room`);

    // Init device
    const device = new Device();

    // Get rtp capabilities from server router and call device.load()
    let res: Response;
    res = await fetch(`${baseUrl}/api/rtp_capabilities`);
    handleResponseStatus(res);
    const rtpCapabilities = await res.json();
    await device.load({routerRtpCapabilities: rtpCapabilities});

    // Create send transport on both server and client side
    let transportOptions: TransportOptions;
    res = await fetch(`${baseUrl}/api/create_transport`, {
        method: "POST",
        body: JSON.stringify({
            socketId: socket.id,
            isSender: true,
        })
    });
    handleResponseStatus(res);
    transportOptions = await res.json();
    const sendTransport = device.createSendTransport({ ...transportOptions });

    // Submit to connect event
    sendTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
            const _res = await fetch(`${baseUrl}/api/transport_connect`, {
                method: "POST",
                body: JSON.stringify({
                    socketId: socket.id,
                    isSender: true,
                    dtlsParameters: dtlsParameters,
                })
            });
            handleResponseStatus(_res);
            callback();
        } catch (err) {
            errback(err);
        }
    });

    // Submit to produce event
    sendTransport.on("produce", async (parameters, callback, errback) => {
        try {
            const _res = await fetch(`${baseUrl}/api/transport_produce`, {
                method: "POST",
                body: JSON.stringify({
                    socketId: socket.id,
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                })
            });
            handleResponseStatus(_res);
            const producerId = await _res.json();
            callback({ id: producerId });
        } catch (err) {
            errback(err);
        }
    });

    // Create receive transport on both server and client side
    res = await fetch(`${baseUrl}/api/create_transport`, {
        method: "POST",
        body: JSON.stringify({
            socketId: socket.id,
            isSender: false,
        })
    });
    handleResponseStatus(res);
    transportOptions = await res.json();
    const recvTransport = device.createRecvTransport({ ...transportOptions });

    // Submit to connect event
    recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
            const _res = await fetch(`${baseUrl}/api/transport_connect`, {
                method: "POST",
                body: JSON.stringify({
                    socketId: socket.id,
                    isSender: false,
                    dtlsParameters: dtlsParameters,
                })
            });
            handleResponseStatus(_res);
            callback();
        } catch (err) {
            errback(err);
        }
    });

    return new Participant(baseUrl, socket, device, sendTransport, recvTransport);
};

function handleResponseStatus(res: Response) {
    if (res.status !== 200) {
        throw new Error(`Status ${res.status}: ${res.statusText}`);
    }
}