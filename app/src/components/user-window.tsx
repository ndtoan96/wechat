import { Producer } from "mediasoup-client/lib/Producer";
import React, { useContext, useEffect, useRef, useState } from "react";
import { ParticipantContext } from "../App";

export default function UserWindow() {
    const participant = useContext(ParticipantContext);
    const videoEl = useRef<HTMLVideoElement>(null);
    const [producer, setProducer] = useState<Producer>();

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then((stream) => {
            const track = stream.getTracks()[0];
            if(videoEl.current) {
                videoEl.current.srcObject = stream;
            }
            participant?.produceMedia({ track }).then((_producer) => {
                setProducer(_producer);
            });
        });
    }, [participant]);

    return (<>
        <video ref={videoEl} autoPlay />
    </>);
}