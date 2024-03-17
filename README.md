<div align="center">
  <img src="norsk-bott-icon.png" alt="NLL Logo" width="150px">
</div>

# Norsk-bott

This repository contains the source code that powers the Norsk-bott Discord bot. The bot is written in [TypeScript](https://www.typescriptlang.org/) and uses the [Discord.js](https://discord.js.org), [NestJS](https://nestjs.com), and [discord-nestjs](https://github.com/fjodor-rybakov/discord-nestjs) libraries.

## Contributing

Make sure you have [Node.js](https://nodejs.org/en/) and [Yarn](https://yarnpkg.com/) installed.

> [!TIP]
> It is recommended to use [Volta](https://volta.sh/) to manage Node.js versions. If Volta is installed, you do not need to do anything. When you run any commands in this repository, Volta will automatically install and install the correct versions of both Node.js and Yarn.

1. Clone the repository
2. Run `yarn` to install dependencies
3. Configure the environment variables by copying the `template.env` file to `.env` and filling in the values. (You will need to create a bot on the [Discord Developer Portal](https://discord.com/developers/applications) and get a token, as well as a test server for the bot to join. You will also need an API key for [DeepL](https://www.deepl.com/pro-api) for the translation commands.)
4. Run `yarn start:dev` to start the bot in development mode. The bot will now be running and you can make changes to the code. The bot will automatically restart when you save changes.

```sh
git clone https://github.com/nllcommunity/discord-norsk-bott.git
cd discord-norsk-bott

yarn
cp template.env .env
# Fill in the values in the .env file

yarn start:dev
```

## Permissions

The bot requires the following permissions to function correctly:

### OAuth2 Scopes

- bot
- application.commands

### Bot Permissions

- Read Messages/View Channels
- Send Messages
- Send Messages in Threads
- Manage Messages
- Add Reactions
- Use Slash Commands

## Licence

[ISC](LICENCE)
