import { time } from 'console';
import React, { useState, useEffect, useRef } from 'react';
import YouTube, { YouTubeProps } from 'react-youtube';

export default function YoutubePlayer() {


    const [totalDuration, setTotalDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [paused, setPaused] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const socketReady = useRef(false);
    const playerReady = useRef(false);
    let initialLoadTime = {
        time: 0,
        currentTime: 0
    };

    type socketMessage = {
        type: 'play' | 'pause' | 'seek' | 'connected';
        message: string;
    }
    const ws = useRef<WebSocket>(null);

    useEffect(() => {
        ws.current = new WebSocket('ws://localhost:8080');

        ws.current.onopen = () => {
            console.log('Connected to WebSocket server');
            socketReady.current = true;
        };

        ws.current.onmessage = async (event) => {
            console.log('Received:', event.data);
            const data: socketMessage = JSON.parse(event.data);
            if (data.type == "pause" || data.type == "play") {
                // console.log(paused, data.type);
                const action = data.type == "pause" ? 'pause' : 'play';
                handlePause(action, true);
            }

            if (data.type == "seek") {
                handleSeek(Number(data.message), true);
            }

            if (data.type == "connected") {
                initialLoadTime = JSON.parse(data.message);
            }
        };

        intervalRef.current = setInterval(() => {
            if (playerReady.current && socketReady.current) {
                setCurrentTime(playerRef?.current?.getCurrentTime() || 0);
            }
        }, 100);

        return () => {
            if (ws.current) {
                ws.current.close();
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const playerRef = useRef<any>(null);
    const onPlayerReady: YouTubeProps['onReady'] = (event) => {
        playerRef.current = event.target;

        setTotalDuration(playerRef.current.getDuration());
        playerReady.current = true;
        debugger
        const timestamp = initialLoadTime?.time ? ( initialLoadTime?.time + (((Date.now() - initialLoadTime.currentTime)) / 1000) ) : 0;
        handleSeek(Number(timestamp), true);
        // access to player in all event handlers via event.target
        // event.target.playVideo(1);
    }

    function handleSeek(time: number, serverInitiated = false) {
        if (socketReady.current && playerReady.current) {
            playerRef?.current?.seekTo(time, true);
            if (!serverInitiated) {
                const data: socketMessage = {
                    type: 'seek',
                    message: time.toString(),
                }

                if (ws.current) {
                    ws.current.send(JSON.stringify(data));
                }
            }

        }
    }

    const handlePause = (action: 'play' | 'pause', serverInitiated = false) => {
        debugger;
        if (action === 'play') {
            playerRef?.current?.playVideo();
            setPaused(false);
        } else {
            playerRef?.current?.pauseVideo();
            setPaused(true);
        }

        if (socketReady.current && playerReady.current && !serverInitiated) {
            const data: socketMessage = {
                type: action == 'play' ? 'play' : 'pause',
                message: playerRef?.current.getCurrentTime().toString(),
            }

            if (ws.current) {
                ws.current.send(JSON.stringify(data));
            }
        }
    }

    function handleMute() {
        if (playerReady?.current) playerRef?.current?.unMute();
    }

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }


    const opts: YouTubeProps['opts'] = {
        height: '390',
        width: '640',
        playerVars: {
            // https://developers.google.com/youtube/player_parameters
            autoplay: 1,
            mute: 1,
            controls: 0,
        },
    };

    return <>
        <YouTube ref={playerRef} videoId="bHQqvYy5KYo" opts={opts} onReady={onPlayerReady} />
        <button onClick={() => handlePause(paused ? 'play' : 'pause')}> {paused ? 'Play' : 'Pause'} </button>
        <div>
            {formatTime(currentTime)} / {formatTime(totalDuration)}
            <input
                type="range"
                min="0"
                max={totalDuration || 1} // Use actual duration, fallback to 1 to avoid errors
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                style={{ width: '300px' }}
                step="0.1" // Allow finer seeking control
            />
        </div>
        <button onClick={() => handleMute()}>Unmute</button>
    </>;
}