/*
 * discord/index.js
 *
 *  Initializing bots and describing dependencies
 *  This is the main source for handling discord API
 * 
 */

"use strict";

const discord = require('discord.js');
const { Client, Intents, MessageAttachment } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [
  Intents.FLAGS.GUILDS,
  Intents.FLAGS.GUILD_MESSAGES,
  Intents.FLAGS.GUILD_VOICE_STATES,
] });

client.on('ready', () =>{
  console.log('Bot is ready');
  client.user.setPresence({ activity: { name: 'gaming' } });
});

if(!process.env.DISCORD_BOT_TOKEN){
  console.log('DISCORD_BOT_TOKEN has not been set.');
  process.exit(1);
}

(async () =>{
    const plugin = await import(`./receiver.js`);
    // plugin.receiver(client);
    plugin.receiver(client);
    console.log(`MusicBot successfully loaded.`);
})();

client.login( process.env.DISCORD_BOT_TOKEN );