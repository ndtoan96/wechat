import React, { useContext, useEffect, useRef } from "react";
import { ParticipantContext } from "../App";

export default function UserWindow() {
    const participant = useContext(ParticipantContext);
    const videoEl = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then((stream) => {
            if(videoEl.current) {
                videoEl.current.srcObject = stream;
            }
            
            for (let track of stream.getTracks()) {
                participant?.produceMedia({ track });
            }
        });
    }, [participant]);

    return (<>
        <video ref={videoEl} autoPlay />
    </>);
}