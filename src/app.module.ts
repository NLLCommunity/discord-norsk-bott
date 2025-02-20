import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscordModule } from '@discord-nestjs/core';
import { GatewayIntentBits, Partials } from 'discord.js';
import { NestProviderCollection } from './utils/index.js';
import * as providers from './providers/index.js';
import * as commands from './commands/index.js';
import * as handlers from './handlers/index.js';

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
      setupClientFactory: (client) => {
        client.setMaxListeners(100);
      },
      inject: [ConfigService],
    }),
    DiscordModule.forFeature(),
  ],
  providers: NestProviderCollection.fromInjectables(providers)
    .concat(NestProviderCollection.fromInjectables(commands))
    .concat(NestProviderCollection.fromInjectables(handlers))
    .except(handlers.MusicLinkHandler)
    .add({
      provide: 'ISearchEngineProvider',
      useClass: providers.CompositeSearchEngineProvider,
    })
    .toArray(),
})
export class AppModule {}
