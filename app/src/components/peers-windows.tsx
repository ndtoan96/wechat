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
    const [firstInit, setFirstInit] = useState(true);
    const [peerConsumers, setPeerConsumers] = useState<Map<string, Consumer[]>>(new Map());
    const [peerWindows, setPeerWindows] = useState<JSX.Element[]>([]);

    useEffect(() => {
        const refreshPeerWindows = () => {
            let newPeerWindows: JSX.Element[] = [];
            peerConsumers.forEach((consumers, socketId) => {
                newPeerWindows.push(<PeerWindow key={socketId} consumers={consumers} />);
            });
            setPeerWindows(newPeerWindows);
        };
        participant?.socket.on("peer-change", async ({ event, socketId, producerId }: PeerChangeData) => {
            switch (event) {
                case "peer-join": {
                    // Do nothing since new peer has not produced
                    break;
                }
                case "peer-left": {
                    setPeerConsumers((prev) => {
                        prev.delete(socketId);
                        return prev;
                    });
                    break;
                }
                case "new-producer": {
                    if (producerId !== undefined) {
                        const newConsumer = await participant.consumeMedia(producerId);
                        setPeerConsumers((prev) => {
                            if (prev.has(socketId)) {
                                prev.get(socketId)?.push(newConsumer);
                            } else {
                                prev.set(socketId, [newConsumer]);
                            }
                            return prev;
                        });
                    } else {
                        throw new Error("ProducerId is undefined");
                    }
                    break;
                }
                default: {
                    throw new Error("Unexpected peer-change event");
                }
            }
            refreshPeerWindows();
        });
        if (firstInit === true) {
            participant?.getPeers().then((peers) => {
                peers.forEach((peer) => {
                    if(peer.socketId !== participant.socket.id) {
                        peer.producers.forEach(async (producerId) => {
                            const consumer = await participant.consumeMedia(producerId);
                            if (peerConsumers.has(peer.socketId)) {
                                peerConsumers.get(peer.socketId)?.push(consumer);
                            } else {
                                peerConsumers.set(peer.socketId, [consumer]);
                            }
                        });
                    }
                });
                setFirstInit(false);
                refreshPeerWindows();
            });
        }
    }, [participant, firstInit, peerConsumers]);

    return (<> {peerWindows} </>);
}