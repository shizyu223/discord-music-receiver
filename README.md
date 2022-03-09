# Discord-Music-Bot

This bot is Discord Music Bot acting in concert with [shizyu223/discord-util-bot](https://github.com/shizyu223/discord-util-bot).


# dependencies

This bot requires ffmpeg with libopus, so you have to install it to your environment as below to use this bot.

OS X (with HomeBrew)
```
$ brew install opus
$ brew install ffmpeg
$ ffmpeg -codecs | grep opus
```
Linux
```
$ sudo apt-get install ffmpeg --enable-libopus
```