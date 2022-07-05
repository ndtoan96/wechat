import { Consumer } from "mediasoup-client/lib/Consumer";
import React, { useContext, useEffect, useState } from "react";
import { ParticipantContext } from "../App";
import PeerWindow from "./peer-window";

interface PeerChangeData {
    event: "peer-join" | "peer-left" | "new-producer";
    socketId: string,
    producerId?: string,
}

export default function PeersWindows() {
    const participant = useContext(ParticipantContext);
    const [consumerMap, setConsumerMap] = useState(new Map<string, Consumer[]>());

    useEffect(() => {
        participant?.socket.on("peer-change", async ({ event, socketId, producerId }: PeerChangeData) => {
            switch (event) {
                case "peer-join": {
                    setConsumerMap((prev) => {
                        const newMap = new Map(prev);
                        newMap.set(socketId, []);
                        return newMap;
                    });
                    break;
                }
                case "peer-left": {
                    setConsumerMap((prev) => {
                        const newMap = new Map(prev);
                        newMap.delete(socketId);
                        return newMap;
                    });
                    break;
                }
                case "new-producer": {
                    const newConsumer = await participant.consumeMedia(producerId!);
                    setConsumerMap((prev) => {
                        const newMap = new Map(prev);
                        const oldConsumers = prev.get(socketId);
                        if (oldConsumers) {
                            newMap.set(socketId, [...oldConsumers, newConsumer]);
                        } else {
                            newMap.set(socketId, [newConsumer]);
                        }
                        return newMap;
                    });
                    break;
                }
                default: {
                    throw new Error("unexpected peer-change event");
                }
            }
        });

        participant?.getPeers().then(async (peers) => {
            const newConsumerMap: Map<string, Consumer[]> = new Map();
            for (let peer of peers) {
                if (peer.socketId !== participant.socket.id) {
                    const consumers: Consumer[] = [];
                    for (let producerId of peer.producers) {
                        const consumer = await participant.consumeMedia(producerId);
                        consumers.push(consumer);
                    }
                    newConsumerMap.set(peer.socketId, consumers);
                }
            }
            setConsumerMap(newConsumerMap);
        });
        return () => {
            participant?.socket.off("peer-change");
        };
    }, [participant]);

    const peerWindows: JSX.Element[] = [];
    consumerMap.forEach((consumers, socketId) => {
        peerWindows.push(<PeerWindow consumers={consumers} key={socketId} />);
    });

    return (
        <>
            {peerWindows}
        </>
    );
}