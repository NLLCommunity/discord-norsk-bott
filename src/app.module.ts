import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscordModule } from '@discord-nestjs/core';
import { GatewayIntentBits } from 'discord.js';
import { NestClassCollection } from './utils';
import * as providers from './providers';
import * as commands from './commands';

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
          ],
        },
        registerCommandOptions: [{ removeCommandsBefore: true }],
        failOnLogin: true,
      }),
      inject: [ConfigService],
    }),
    DiscordModule.forFeature(),
  ],
  providers: NestClassCollection.fromInjectables(providers)
    .concat(NestClassCollection.fromInjectables(commands))
    .toArray(),
})
export class AppModule {}
