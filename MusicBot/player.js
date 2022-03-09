/*
 * MusicBot/player.js
 *
 *  Define Player class, which send music stream to Bot.
 * 
 */

"use strict";

const {
	AudioPlayerStatus,
	createAudioPlayer,
    createAudioResource,
    demuxProbe,
	entersState,
	VoiceConnectionDisconnectReason,
	VoiceConnectionStatus,
    NoSubscriberBehavior,
} = require('@discordjs/voice');
const { promisify } = require('node:util');
const { exec } = require('youtube-dl-exec');
const { Converter } = require('ffmpeg-stream');
const wait = promisify(setTimeout);

class Player {
    constructor(voiceConnection, errorMessageChannel, socket){
        this.readyLock = false;
        this.voiceConnection = voiceConnection;
        this.errorMessageChannel = errorMessageChannel;
        this.socket = socket;
        this.audioPlayer = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            },
        });
	    this.voiceConnection.on('stateChange', async (_, newState) => {
            console.log(newState.status);
            if (newState.status === VoiceConnectionStatus.Disconnected) {
                if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                    /**
                     * If the WebSocket closed with a 4014 code, this means that we should not manually attempt to reconnect,
                     * but there is a chance the connection will recover itself if the reason of the disconnect was due to
                     * switching voice channels. This is also the same code for the bot being kicked from the voice channel,
                     * so we allow 5 seconds to figure out which scenario it is. If the bot has been kicked, we should destroy
                     * the voice connection.
                     */
                    try {
                        await entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5 * 1000);
                        // Probably moved voice channel
                    } catch {
                        this.voiceConnection.destroy();
                        // Probably removed from voice channel
                    }
                } else if (this.voiceConnection.rejoinAttempts < 5) {
                    /**
                      * The disconnect in this case is recoverable, and we also have <5 repeated attempts so we will reconnect.
                     */
                    await wait((this.voiceConnection.rejoinAttempts + 1) * 5 * 1000);
                        this.voiceConnection.rejoin();
                } else {
                    /**
                     * The disconnect in this case may be recoverable, but we have no more remaining attempts - destroy.
                     */
                    this.voiceConnection.destroy();
                }
            } else if (newState.status === VoiceConnectionStatus.Destroyed) {
                /**
                 * Once destroyed, stop the subscription.
                 */
                this.stop();
            } else if (
                !this.readyLock &&
                (newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling)
            ) {
                /**
                 * In the Signalling or Connecting states, we set a 20 second time limit for the connection to become ready
                 * before destroying the voice connection. This stops the voice connection permanently existing in one of these
                 * states.
                 */
                this.readyLock = true;
                try {
                    await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20 * 1000);
                } catch {
                    if (this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) this.voiceConnection.destroy();
                } finally {
                    this.readyLock = false;
                }
            }
        });
    
        // Configure audio player
        this.audioPlayer.on('stateChange', (oldState, newState) => {
            if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
                // If the Idle state is entered from a non-Idle state, it means that an audio resource has finished playing.
                // Send a request to main-server to get the info about next track.      
                this.socket.emit('reqTrack');
                this.onFinish();
            } else if (newState.status === AudioPlayerStatus.Playing) {
                // If the Playing state has been entered, then a new track has started playback.
                this.onStart();
            }
        });
    
        this.audioPlayer.on('error', (error) => this.onError(error));
        voiceConnection.subscribe(this.audioPlayer);
    }

    async playTrack(Track) {
        if(this.audioPlayer.state.status !== AudioPlayerStatus.Idle) return;
        await makeAudioResource(Track.url, Track.loudnessDB)
            .then((resource) => {
                this.audioPlayer.play(resource);
            })
            .catch(error => {
                this.socket.emit('unlockQueue');
                this.onError(error);
                this.socket.emit('deleteErrorTrack');
                console.log('error');
                return;
            });
        this.socket.emit('unlockQueue');
    }

    pause() {
		this.audioPlayer.pause(true);
	}

    resume() {
		this.audioPlayer.unpause(true);
	}

    /**
	 * Stops audio playback.
	 */
	stop() {
		this.audioPlayer.stop(true);
        console.log("stop");
	}

    destroy() {
        this.voiceConnection.destroy();
    }

    onStart() {
        console.log('Now playing!');
    }

    onFinish() {
        console.log('Now finished!');
    }

    onError(error) {
        console.warn(error);
        this.errorMessageChannel.send(`Error: ${error.message}`);
    }
}

/**
 * Creates an AudioResource from this Track.
 * loudnessdB must be a negative value.
 */
function makeAudioResource(url, loudnessdB){
    return new Promise((resolve, reject) => {
        const process_ = exec(
            url,
            {
                o: '-',
                q: '',
                f: 'bestaudio[ext=webm+acodec=opus+asr=48000]/bestaudio',
                r: '100K',
            },
            { stdio: ['ignore', 'pipe'] },
        );
        if (!process_.stdout) {
            reject(new Error('No stdout'));
            return;
        }
        const stream = process_.stdout;

        const onError_ = (error) => {
            if (!process_.killed) process_.kill();
            stream.resume();
            reject(error);
        };
  
        const converter = new Converter();
        const input = converter.createInputStream({
            nostdin: true,
            f: "webm",
            acodec: "opus",
        });
        console.log(converter);

        process_.once('spawn', () => {
            stream.pipe(input);
            console.log(`volume=${loudnessdB}dB`);
            const streamOut = 
                converter.createOutputStream({
                    f: "webm",
                    //timelimit: "20",
                    acodec: "opus",
                    af: `volume=${loudnessdB}dB`,
                    //ab: "48K",
                });
            console.log(streamOut);
            converter.run().then(
                resolve(createAudioResource(streamOut))
            ).catch(onError_);
        })
        .catch(onError_);
    });
}

module.exports = {
    Player: Player
}