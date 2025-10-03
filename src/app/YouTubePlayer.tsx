import React, { useState, useEffect, useRef } from 'react';
import YouTube, { YouTubePlayer, YouTubeProps } from 'react-youtube';
import getVideoId from 'get-video-id';

// Simple SVG icon components
const PlayIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
    </svg>
);

const PauseIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
);

const VolumeIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
);

const MutedIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
);

const FullscreenIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
);

const ExitFullscreenIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
);

// Define proper types for fullscreen APIs
interface FullscreenDocument extends Document {
    webkitExitFullscreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
}

interface FullscreenElement extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
}

interface FullscreenDocumentWithElements extends Document {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
}

export default function YoutubePlayer() {
    const [totalDuration, setTotalDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoId, setVideoId] = useState('');
    const [paused, setPaused] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const socketReady = useRef(false);
    const playerReady = useRef(false);
    const urlInputRef = useRef<HTMLInputElement | null>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);

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
        status: 'paused'
    });

    type socketMessage = {
        type: 'loadUrl' | 'play' | 'pause' | 'seek' | 'connected';
        message: string;
        jsonData?: string;
    }

    const ws = useRef<WebSocket>(null);
    const playerRef = useRef<YouTubePlayer | null>(null);

    // Fullscreen functions
    const enterFullscreen = () => {
        const element = playerContainerRef.current as FullscreenElement;
        if (!element) return;

        if (element?.requestFullscreen) {
            element?.requestFullscreen();
        } else if (element?.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element?.msRequestFullscreen();
        }
    };

    const exitFullscreen = () => {
        const doc = document as FullscreenDocument;
        if (doc?.exitFullscreen) {
            doc?.exitFullscreen();
        } else if (doc?.webkitExitFullscreen) {
            doc?.webkitExitFullscreen();
        } else if (doc?.msExitFullscreen) {
            doc?.msExitFullscreen();
        }
    };

    const toggleFullscreen = () => {
        if (!isFullscreen) {
            enterFullscreen();
        } else {
            exitFullscreen();
        }
    };

    // Mute/Unmute functions
    const toggleMute = () => {
        if (playerRef.current) {
            if (isMuted) {
                playerRef.current.unMute();
                setIsMuted(false);
            } else {
                playerRef.current.mute();
                setIsMuted(true);
            }
        }
    };

    useEffect(() => {
        ws.current = new WebSocket(process.env.NEXT_PUBLIC_BACKEND_URL || 'ws://localhost:8080');

        ws.current.onopen = () => {
            console.log('Connected to WebSocket server');
            socketReady.current = true;
        };

        ws.current.onmessage = async (event) => {
            console.log('Received:', event.data);
            const data: socketMessage = JSON.parse(event.data);

            if (data.type === "pause" || data.type === "play") {
                videoData.current = JSON.parse(data?.jsonData || '{}');
                const action = data.type === "pause" ? 'pause' : 'play';
                handlePause(action, true);
            }

            if (data.type === "seek") {
                videoData.current.status = 'playing';
                handleSeek(Math.round(Number(data.message)), true);
            }

            if (data.type === "connected") {
                videoData.current = JSON.parse(data?.jsonData || '{}');
                if (videoData.current.videoId) {
                    setVideoId(videoData.current.videoId);
                }
            }

            if (data.type === "loadUrl") {
                videoData.current = JSON.parse(data?.jsonData || '{}');
                setVideoId(videoData.current.videoId);
                playerRef?.current?.loadVideoById(videoData.current.videoId);
                setPaused(false);
            }
        };

        intervalRef.current = setInterval(() => {
            if (playerReady.current && socketReady.current) {
                setCurrentTime(playerRef?.current?.getCurrentTime() || 0);
            }
        }, 100);

        // Fullscreen change event listener
        const handleFullscreenChange = () => {
            const doc = document as FullscreenDocumentWithElements;
            const fullscreenElement = doc?.fullscreenElement || doc?.webkitFullscreenElement || doc?.msFullscreenElement;
            setIsFullscreen(!!fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);

        return () => {
            if (ws.current) {
                ws.current.close();
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }

            // Fullscreen change event listener cleanup
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('msfullscreenchange', handleFullscreenChange);
        };
    }, []);

    const onPlayerReady: YouTubeProps['onReady'] = (event) => {
        playerRef.current = event.target;
        setTotalDuration(playerRef.current.getDuration());
        playerReady.current = true;

        setIsMuted(playerRef.current.isMuted());

        const videoEnded = videoData.current.status === 'ended' ||
            (videoData.current.status === 'playing' &&
                (videoData.current.time + ((Date.now() - videoData.current.currentTime) / 1000)) >= playerRef.current.getDuration());

        if (videoData.current.status === 'playing' && videoEnded) {
            videoData.current.status = 'ended';
        }

        if (videoData?.current?.videoId) {
            setVideoId(videoData.current.videoId);
            playerRef?.current?.loadVideoById(videoData.current.videoId);
        }

        let timestamp = videoData.current?.currentTime ?
            (videoData.current?.time + (((Date.now() - videoData.current.currentTime)) / 1000)) : 0;
        timestamp = videoData.current.status == 'paused' ? videoData.current?.time : timestamp;
        handleSeek(Math.round(Number(timestamp)), true);
    }

    const onPlayerPause: YouTubeProps['onPause'] = (event) => {
        console.log('video paused', event)
        if (videoData?.current?.status == 'playing') {
            playerRef?.current?.playVideo();
        }
        setPaused(true);
    }

    const onPlayerPlay: YouTubeProps['onPlay'] = (event) => {

        let timestamp = videoData.current?.currentTime ? (videoData.current?.time + (((Date.now() - videoData.current.currentTime)) / 1000)) : 0;
        timestamp = videoData.current.status == 'paused' ? videoData.current?.time : timestamp;
        if (videoData.current.status === 'ended') {
            playerRef.current.seekTo(playerRef.current.getDuration(), true);
            videoData.current.status = 'playing';
            return;
        }
        if (Math.abs(event.target.getCurrentTime() - timestamp) > 1.5) {
            handleSeek(Number(timestamp), true);
        }

        if (videoData?.current?.status == 'paused') {
            handlePause('pause', true);
        }

        setPaused(false);
    }

    const onPlayerEnd: YouTubeProps['onEnd'] = (event) => {
        setCurrentTime(event.target.getDuration());
        setTotalDuration(event.target.getDuration());
        setPaused(true);
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
        let time = Math.round(playerRef?.current?.getCurrentTime()) || 0;
        if (time >= (playerRef.current.getDuration() - 1)) { time = 0 }
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
            modestbranding: 1,
            controls: 0, // Disable YouTube controls
            disablekb: 1, // Disable keyboard controls
            fs: 0, // Disable fullscreen button
        },
    };

    return (
        <>
            <div>
                <input type="search" placeholder="Enter youtube url" id="url" ref={urlInputRef} />
                <button onClick={() => handleUrlLoad()}>Load video</button>
            </div>
            {videoId &&
                <div
                    ref={playerContainerRef}
                    style={{
                        width: '100%',
                        height: isFullscreen ? '100vh' : '70vh',
                        display: 'flex',
                        flexDirection: 'column',
                        padding: isFullscreen ? '0' : '20px',
                        boxSizing: 'border-box',
                        backgroundColor: isFullscreen ? '#000' : 'transparent',
                        position: 'relative'
                    }}
                >
                    <div style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative'
                    }}>
                        <YouTube
                            videoId={videoId}
                            opts={opts}
                            onReady={onPlayerReady}
                            onPlay={onPlayerPlay}
                            onPause={onPlayerPause}
                            onEnd={onPlayerEnd}
                            style={{
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none'
                            }}
                        />

                        {/* Controls overlaid inside the player */}
                        <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                        }}>
                            {/* Progress bar */}
                            <input
                                type="range"
                                min="0"
                                max={totalDuration || 1}
                                value={currentTime}
                                onChange={(e) => handleSeek(Number(e.target.value))}
                                style={{
                                    width: '100%',
                                    height: '4px',
                                    background: '#666',
                                    outline: 'none',
                                    borderRadius: '2px'
                                }}
                                step="0.1"
                            />

                            {/* Control buttons row */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '15px',
                                color: '#fff'
                            }}>
                                <button
                                    onClick={() => handlePause(paused ? 'play' : 'pause')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {paused ? <PlayIcon /> : <PauseIcon />}
                                </button>

                                <div style={{ color: '#fff', fontSize: '14px' }}>
                                    {formatTime(currentTime)} / {formatTime(totalDuration)}
                                </div>

                                <div style={{ flex: 1 }}></div>

                                {/* Volume controls */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}>
                                    <button
                                        onClick={toggleMute}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'white',
                                            cursor: 'pointer',
                                            padding: '8px',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        {isMuted ? <MutedIcon /> : <VolumeIcon />}
                                    </button>
                                </div>

                                <button
                                    onClick={() => toggleFullscreen()}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            }
        </>
    );
}