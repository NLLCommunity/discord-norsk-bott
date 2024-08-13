import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Discourser from 'discourser';
import { escape } from 'querystring';

export interface DiscourseTopicResult {
  id: number;
  title: string;
  snippet: string;
  url: string;
}

interface TagsDescriptions {
  [key: string]: string;
}

interface Poster {
  extras: string | null;
  description: string;
  user_id: number;
  primary_group_id: number | null;
  flair_group_id: number | null;
}

interface Topic {
  id: number;
  title: string;
  fancy_title: string;
  slug: string;
  posts_count: number;
  reply_count: number;
  highest_post_number: number;
  image_url: string | null;
  created_at: string;
  last_posted_at: string;
  bumped: boolean;
  bumped_at: string;
  archetype: string;
  unseen: boolean;
  pinned: boolean;
  unpinned: boolean | null;
  visible: boolean;
  closed: boolean;
  archived: boolean;
  bookmarked: boolean | null;
  liked: boolean | null;
  tags: string[];
  tags_descriptions: TagsDescriptions;
  views: number;
  like_count: number;
  has_summary: boolean;
  last_poster_username: string;
  category_id: number;
  pinned_globally: boolean;
  featured_link: string | null;
  is_post_voting: boolean;
  has_accepted_answer: boolean;
  posters: Poster[];
}

interface User {
  id: number;
  username: string;
  name: string | null;
  avatar_template: string;
  moderator: boolean;
  trust_level: number;
  admin?: boolean;
}

interface SimilarTopic {
  id: number;
  blurb: string;
  created_at: string;
  url: string;
  topic_id: number;
}

interface SimilarTopicsApiResponse {
  topics: Topic[];
  users: User[];
  primary_groups: any[];
  flair_groups: any[];
  similar_topics: SimilarTopic[];
  __rest_serializer: string;
}

@Injectable()
export class DiscourseProvider {
  readonly #url: string;
  readonly #apiKey: string;
  readonly #username: string;
  readonly #client?: Discourser;

  constructor(configService: ConfigService) {
    this.#url = configService.get<string>('DISCOURSE_URL') ?? '';
    this.#apiKey = configService.get<string>('DISCOURSE_TOKEN') ?? '';
    this.#username = configService.get<string>('DISCOURSE_USERNAME') ?? '';

    if (this.isConfigured) {
      this.#client = new Discourser({
        host: this.#url,
        key: this.#apiKey,
        username: this.#username,
      });
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.#url && this.#apiKey && this.#username);
  }

  get client(): Discourser | undefined {
    return this.#client;
  }

  /**
   * Finds similar topics in the Discourse forum to a given prospective topic.
   * @param title The title of the topic being used as a reference.
   * @param raw The raw content of the topic being used as a reference.
   */
  async similarTopics(
    title: string,
    raw: string,
  ): Promise<DiscourseTopicResult[]> {
    if (!this.isConfigured) {
      return [];
    }

    const topics = await this.#client?.fetch<SimilarTopicsApiResponse>({
      url: `${this.#url}/similar_topics?title=${escape(title)}&raw=${escape(raw)}`,
    });

    if (!topics?.similar_topics.length) {
      return [];
    }

    return topics.similar_topics.map((topic) => ({
      id: topic.id,
      title: topics.topics.find((t) => t.id === topic.topic_id)?.title ?? '',
      snippet: topic.blurb,
      url: topic.url,
    }));
  }
}
