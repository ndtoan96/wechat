import { Consumer } from "mediasoup-client/lib/Consumer";
import React, { useEffect, useRef } from "react";

interface PeerWindowProps {
    consumers_promises: (Promise<Consumer> | undefined)[]
}

export default function PeerWindow(props: PeerWindowProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const stream = new MediaStream();
        props.consumers_promises.forEach((promise) => {
            if(promise) {
                promise.then((consumer) => {
                    stream.addTrack(consumer.track);
                })
            }
        })
        if(videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [props.consumers_promises]);

    return (<>
        <video ref={videoRef} autoPlay />
    </>);
}