import React, { useState, useEffect, useRef } from 'react';
import YouTube, { YouTubePlayer, YouTubeProps } from 'react-youtube';
import getVideoId from 'get-video-id';

export default function YoutubePlayer() {
    const [totalDuration, setTotalDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoId, setVideoId] = useState('');
    const [paused, setPaused] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
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
        const element = playerContainerRef.current;
        if (!element) return;

        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if ((element as any).webkitRequestFullscreen) {
            (element as any).webkitRequestFullscreen();
        } else if ((element as any).msRequestFullscreen) {
            (element as any).msRequestFullscreen();
        }
    };

    const exitFullscreen = () => {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
            (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
            (document as any).msExitFullscreen();
        }
    };

    const toggleFullscreen = () => {
        if (!isFullscreen) {
            enterFullscreen();
        } else {
            exitFullscreen();
        }
    };

    // Fullscreen change event listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            const fullscreenElement = document.fullscreenElement ||
                (document as any).webkitFullscreenElement ||
                (document as any).msFullscreenElement;
            setIsFullscreen(!!fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('msfullscreenchange', handleFullscreenChange);
        };
    }, []);

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
    }, [isFullscreen]);

    const onPlayerReady: YouTubeProps['onReady'] = (event) => {
        playerRef.current = event.target;
        setTotalDuration(playerRef.current.getDuration());
        playerReady.current = true;

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
                        backgroundColor: isFullscreen ? '#000' : 'transparent'
                    }}
                >
                    <div style={{
                        width: '100%',
                        height: '100%',
                        marginBottom: isFullscreen ? '0' : '20px'
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
                    </div>

                    {/* Controls Container - Hidden in fullscreen or shown as overlay */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        marginBottom: '10px',
                        padding: isFullscreen ? '20px' : '0',
                        position: isFullscreen ? 'absolute' : 'static',
                        bottom: isFullscreen ? '0' : 'auto',
                        left: isFullscreen ? '0' : 'auto',
                        right: isFullscreen ? '0' : 'auto',
                        backgroundColor: isFullscreen ? 'rgba(0,0,0,0.7)' : 'transparent',
                        zIndex: isFullscreen ? 1000 : 'auto'
                    }}>
                        <button onClick={() => handlePause(paused ? 'play' : 'pause')}>
                            {paused ? 'Play' : 'Pause'}
                        </button>

                        <button onClick={() => toggleFullscreen()}>
                            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        </button>

                        <div style={{ color: isFullscreen ? '#fff' : '#000' }}>
                            {formatTime(currentTime)} / {formatTime(totalDuration)}
                        </div>

                        <input
                            type="range"
                            min="0"
                            max={totalDuration || 1}
                            value={currentTime}
                            onChange={(e) => handleSeek(Number(e.target.value))}
                            style={{
                                width: isFullscreen ? '300px' : '200px',
                                marginLeft: '10px'
                            }}
                            step="0.1"
                        />
                    </div>
                </div>
            }
        </>
    );
}