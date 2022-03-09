/* 
 * MusicBot/receiver.js
 *
 *  Receive commands from discord-music-bot server using socket.io
 * 
 */

"use strict";

const { createServer } = require("http");
const { Server } = require('socket.io');
const { Player } = require('./player');
const {
    entersState,
    joinVoiceChannel,  
    VoiceConnectionStatus,
  } = require('@discordjs/voice');
const { promisify } = require('node:util');

const wait = promisify(setTimeout);

const server = createServer();
var io = new Server(server);

var player;

module.exports = (client) => {
  io.sockets.on('connection', (socket) => {
    console.log("connected");
    socket.on('initialize', (voiceChannelid, textChannelid) => {
        console.log(voiceChannelid);
        const channel = client.channels.cache.filter((channel)=> channel.id === voiceChannelid).first();
        const textChannel = client.channels.cache.filter((channel)=> channel.id === textChannelid).first();
        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false,
        });
        player = new Player(connection, textChannel, socket);
    });
    socket.on('newTrack', async (Track) => {
        let attempts = 0;
        while(!player){
          await wait(100 * (attempts + 1));
          attempts++;
          if(attempts >= 40){
            socket.emit('E_PlayerClass');
            return;
          };
        }
        try {
          await entersState(player.voiceConnection, VoiceConnectionStatus.Ready, 20 * 1000);
        } catch (error) {
          console.warn(error);
          await console.log('Failed to join voice channel within 20 seconds, please try again later!');
          return;
        } finally {
          player.playTrack(Track);
        }
    });
    socket.on('musicSkip', () => {
        if(player){
          player.stop();
        }
    });
    socket.on('musicPause', () => {
        if(player){
          player.pause();
        }
    });
    socket.on('musicResume', () => {
        if(player){
          player.resume();
        }
    });
    socket.on('destroy', () => {
        if(player){
          player.destroy();
        }
          player = undefined;
    });
    socket.on('disconnect', () => {
      console.log("disconnected");
      if(player){
        player.destroy();
        player = undefined;
      }
    });
  });
}

server.listen(4000);