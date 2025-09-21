import React, { useState, useEffect, useRef } from 'react';
import YouTube, { YouTubePlayer, YouTubeProps } from 'react-youtube';
import getVideoId from 'get-video-id';

export default function YoutubePlayer() {
    const [totalDuration, setTotalDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoId, setVideoId] = useState('');
    const [paused, setPaused] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const socketReady = useRef(false);
    const playerReady = useRef(false);
    const urlInputRef = useRef<HTMLInputElement | null>(null);
    type VideoDataType = {
        time: number;
        currentTime: number;
        videoId: string;
        status: 'playing' | 'paused' | 'seek' | 'buffering' | 'ended';
    }
    const videoData = useRef<VideoDataType>({
        time: 0,
        currentTime: 0,
        videoId: '',
        status: 'paused' // playing, paused, seek, buffering, ended
    });

    type socketMessage = {
        type: 'loadUrl' | 'play' | 'pause' | 'seek' | 'connected';
        message: string;
        jsonData?: string; // json string
    }

    const ws = useRef<WebSocket>(null);

    useEffect(() => {
        // ws.current = new WebSocket('https://chilltogether-backend.onrender.com');
        ws.current = new WebSocket('ws://localhost:8080');

        ws.current.onopen = () => {
            console.log('Connected to WebSocket server');
            socketReady.current = true;
        };

        ws.current.onmessage = async (event) => {
            console.log('Received:', event.data);
            const data: socketMessage = JSON.parse(event.data);
            if (data.type == "pause" || data.type == "play") {
                videoData.current = JSON.parse(data?.jsonData || '{}');
                const action = data.type == "pause" ? 'pause' : 'play';
                handlePause(action, true);
            }

            if (data.type == "seek") {
                videoData.current.status = 'playing';
                handleSeek(Number(data.message), true);
            }

            if (data.type == "connected") {
                videoData.current = JSON.parse(data?.jsonData || '{}');
                if (videoData.current.videoId) {
                    setVideoId(videoData.current.videoId);
                }
            }

            if (data.type == "loadUrl") {
                videoData.current = JSON.parse(data?.jsonData || '{}');
                setVideoId(videoData.current.videoId);
                playerRef?.current?.loadVideoById(videoData.current.videoId)
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

    const playerRef = useRef<YouTubePlayer | null>(null);
    const onPlayerReady: YouTubeProps['onReady'] = (event) => {
        playerRef.current = event.target;
        setTotalDuration(playerRef.current.getDuration());
        playerReady.current = true;
        if (videoData?.current?.videoId) {
            setVideoId(videoData.current.videoId);
            playerRef?.current?.loadVideoById(videoData.current.videoId)
        }
        const timestamp = videoData.current?.currentTime ? (videoData.current?.time + (((Date.now() - videoData.current.currentTime)) / 1000)) : 0;
        handleSeek(Math.round(Number(timestamp)), true);
    }

    const onPlayerPause: YouTubeProps['onPause'] = (event) => {
        console.log('video paused', event)
        if (videoData?.current?.status == 'playing') {
            playerRef?.current?.playVideo();
        }
    }

    const onPlayerPlay: YouTubeProps['onPlay'] = (event) => {

        const timestamp = videoData.current?.currentTime ? (videoData.current?.time + (((Date.now() - videoData.current.currentTime)) / 1000)) : 0;
        if (Math.abs(event.target.getCurrentTime() - timestamp) > 2) {
            handleSeek(Number(timestamp), true);
        }

        if (videoData?.current?.status == 'paused') {
            handlePause('pause', true);
        }
    }

    function handleSeek(time: number, serverInitiated = false) {
        if (socketReady.current && playerReady.current) {
            playerRef?.current?.seekTo(time, true);
            console.log("inside seek", time);
            videoData.current = {
                time,
                currentTime: Date.now(),
                videoId: videoId,
                status: videoData.current.status
            }
            if (!serverInitiated) {
                const data: socketMessage = {
                    type: 'seek',
                    message: time.toString(),
                    jsonData: JSON.stringify(videoData.current)
                }

                if (ws.current) {
                    ws.current.send(JSON.stringify(data));
                }
            }
        }
    }

    const handlePause = (action: 'play' | 'pause', serverInitiated = false) => {
        if (action === 'play') {
            playerRef?.current?.playVideo();
            setPaused(false);
        } else {
            playerRef?.current?.pauseVideo();
            setPaused(true);
        }
        const time = playerRef?.current?.getCurrentTime() || 0;
        videoData.current = {
            time,
            currentTime: Date.now(),
            videoId: videoId,
            status: action == 'play' ? 'playing' : 'paused'
        }
        if (socketReady.current && playerReady.current && !serverInitiated) {
            const data: socketMessage = {
                type: action == 'play' ? 'play' : 'pause',
                message: playerRef?.current.getCurrentTime().toString(),
                jsonData: JSON.stringify(videoData.current)
            }

            if (ws.current) {
                ws.current.send(JSON.stringify(data));
            }
        }
    }

    function handleUrlLoad() {
        const url = urlInputRef?.current?.value;
        if (!url) return;
        // Find the last slash position
        const { id } = getVideoId(url);
        if (id?.length !== 11) {
            console.error("Invalid video URL");
            return;
        }
        videoData.current = {
            time: 0,
            currentTime: Date.now(),
            videoId: id,
            status: 'playing'
        }
        if (id) {

            setVideoId(id);
            const data: socketMessage = {
                type: 'loadUrl',
                message: id,
                jsonData: JSON.stringify({
                    time: 0,
                    currentTime: Date.now(),
                    videoId: id
                })
            }
            ws?.current?.send(JSON.stringify(data));
            playerRef?.current?.loadVideoById(id);
        }

    }

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    const opts: YouTubeProps['opts'] = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            mute: 1,
            modestbranding: 0,
        },
    };

    return (
        <>
            <div>
                <input type="search" placeholder="Enter youtube url" id="url" ref={urlInputRef} />
                <button onClick={() => handleUrlLoad()}>Load video</button>
            </div >
            {videoId &&
                <div style={{
                    width: '100%',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '20px',
                    boxSizing: 'border-box'
                }}>
                    <div style={{
                        width: '100%',
                        height: '70%',
                        marginBottom: '20px'
                    }}>
                        <div style={{
                            width: '100%',
                            height: '100%'
                        }}>
                            <YouTube
                                ref={playerRef}
                                videoId={videoId}
                                opts={opts}
                                onReady={onPlayerReady}
                                onPlay={onPlayerPlay}
                                onPause={onPlayerPause}
                                style={{
                                    width: '100%',
                                    height: '100%'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        marginBottom: '10px'
                    }}>
                        <button onClick={() => handlePause(paused ? 'play' : 'pause')}>
                            {paused ? 'Play' : 'Pause'}
                        </button>
                    </div>

                    <div>
                        {formatTime(currentTime)} / {formatTime(totalDuration)}
                        <input
                            type="range"
                            min="0"
                            max={totalDuration || 1}
                            value={currentTime}
                            onChange={(e) => handleSeek(Number(e.target.value))}
                            style={{ width: '300px', marginLeft: '10px' }}
                            step="0.1"
                        />
                    </div>
                </div>
            }
        </>
    );
}