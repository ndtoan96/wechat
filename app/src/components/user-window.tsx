import React, { useContext, useEffect, useRef } from "react";
import { ParticipantContext } from "../App";

export default function UserWindow() {
    const participant = useContext(ParticipantContext);
    const videoEl = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then((stream) => {
            const track = stream.getTracks()[0];
            if(videoEl.current) {
                videoEl.current.srcObject = stream;
            }
            participant?.produceMedia({ track });
        });
    }, [participant]);

    return (<>
        <video ref={videoEl} autoPlay />
    </>);
}