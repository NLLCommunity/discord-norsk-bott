import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscordModule } from '@discord-nestjs/core';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { NestClassCollection } from './utils';
import * as providers from './providers';
import * as commands from './commands';
import * as handlers from './handlers';
import EventEmitter from 'events';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DiscordModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get('DISCORD_TOKEN') ?? '',
        discordClientOptions: {
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMessageReactions,
          ],
          partials: [Partials.Message, Partials.Reaction],
        },
        registerCommandOptions: [{ removeCommandsBefore: true }],
        failOnLogin: true,
      }),
      setupClientFactory: (client: Client) => {
        // Ugly cast required due to https://github.com/discordjs/discord.js/issues/10358
        (client as unknown as EventEmitter).setMaxListeners(100);
      },
      inject: [ConfigService],
    }),
    DiscordModule.forFeature(),
  ],
  providers: NestClassCollection.fromInjectables(providers)
    .concat(NestClassCollection.fromInjectables(commands))
    .concat(NestClassCollection.fromInjectables(handlers))
    .toArray(),
})
export class AppModule {}
