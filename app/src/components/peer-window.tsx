import { Consumer } from "mediasoup-client/lib/Consumer";
import React, { useEffect, useRef } from "react";

interface PeerWindowProps {
    consumers: Consumer[];
}

export default function PeerWindow(props: PeerWindowProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const stream = new MediaStream();
        props.consumers.forEach((consumer) => {
            stream.addTrack(consumer.track);
        })
        if(videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [props.consumers]);

    return (<>
        <video ref={videoRef} autoPlay />
    </>);
}