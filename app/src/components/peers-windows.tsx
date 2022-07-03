import React, { useContext, useEffect, useState } from "react";
import { ParticipantContext } from "../App";
import { PeerData } from "../lib/client";
import PeerWindow from "./peer-window";

export default function PeersWindows() {
    const participant = useContext(ParticipantContext);
    const [peers, setPeers] = useState<PeerData[]>();

    useEffect(() => {
        participant?.socket.on("peer-change", async () => {
            if (participant !== null) {
                const _peers = await participant.getPeers();
                setPeers(_peers.filter((_peer) => {
                    return _peer.socketId !== participant.socket.id;
                }));
            }
        });
    }, [participant, peers]);

    return (<>
        {
            peers?.map((peer, i) => {
                const consumers_promises = peer.producers.map((producerId) => {
                    return participant?.consumeMedia(producerId);
                });
                return <PeerWindow key={i} consumers_promises={consumers_promises} />;
            })
        }
    </>);
}