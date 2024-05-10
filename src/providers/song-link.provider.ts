import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import {
  SongLinkApiProvider,
  SongLinkApiPlatform,
} from './song-link-api.provider';

export interface SongLinks {
  originalPlatform: SongLinkApiPlatform;
  otherPlatformUrls: Partial<Record<SongLinkApiPlatform, string>>;
}

@Injectable()
export class SongLinkProvider {
  #logger = new Logger(SongLinkProvider.name);

  constructor(private readonly songLinks: SongLinkApiProvider) {}

  /**
   * Gets the different distribution platforms for a song, given a song link
   * from a music streaming service.
   */
  async getPlatforms(link: string): Promise<SongLinks | null> {
    const songLinkData = await this.songLinks.getPlatforms(link);

    if (!songLinkData) {
      return null;
    }

    const originalEntity =
      songLinkData.entitiesByUniqueId[songLinkData.entityUniqueId];

    if (!originalEntity) {
      return null;
    }

    const originalPlatform = originalEntity.platforms[0];

    const otherPlatformUrls = Object.entries(
      songLinkData.linksByPlatform,
    ).reduce(
      (acc, [platform, { url }]) => {
        if (platform === originalPlatform) {
          return acc;
        }

        acc[platform as SongLinkApiPlatform] = url;
        return acc;
      },
      {} as Partial<Record<SongLinkApiPlatform, string>>,
    );

    // Special case for YouTube as it can return YouTube Music even if it's not
    // a song and just a video.

    if (
      originalPlatform === SongLinkApiPlatform.Youtube &&
      Object.keys(otherPlatformUrls).length === 1 &&
      SongLinkApiPlatform.YoutubeMusic in otherPlatformUrls
    ) {
      return null;
    }

    return { originalPlatform, otherPlatformUrls };
  }
}
