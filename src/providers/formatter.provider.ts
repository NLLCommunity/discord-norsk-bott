import { Injectable } from '@nestjs/common';
import { Dictionary, Gender, InflectionTag } from '../gql/graphql';

/**
 * Formats common data types for display in Discord.
 */
@Injectable()
export class FormatterProvider {
  /**
   * Formats a dictionary.
   * @param dictionary The dictionary to format.
   */
  formatDictionary(dictionary: Dictionary): string {
    switch (dictionary) {
      case Dictionary.Bokmaalsordboka:
        return 'Bokmålsordboka';

      case Dictionary.Nynorskordboka:
        return 'Nynorskordboka';

      case Dictionary.NorskOrdbok:
        return 'Norsk Ordbok';

      default:
        return dictionary;
    }
  }

  /**
   * Formats a grammatical gender.
   * @param gender The gender to format.
   */
  formatGender(gender: Gender): string {
    switch (gender) {
      case Gender.Hankjoenn:
        return 'hankjønn';

      case Gender.Hokjoenn:
        return 'hokjønn';

      case Gender.HankjoennHokjoenn:
        return 'hankjønn/hokjønn';

      case Gender.Inkjekjoenn:
        return 'inkjekjønn';

      default:
        return gender;
    }
  }

  /**
   * Formats an inflection tag.
   * @param tag The tag to format.
   */
  formatInflectionTag(tag: InflectionTag): string {
    switch (tag) {
      case InflectionTag.Infinitiv:
        return 'infinitiv';

      case InflectionTag.Presens:
        return 'presens';

      case InflectionTag.Preteritum:
        return 'preteritum';

      case InflectionTag.PerfektPartisipp:
        return 'perfekt partisipp';

      case InflectionTag.PresensPartisipp:
        return 'presens partisipp';

      case InflectionTag.SPassiv:
        return 's-passiv';

      case InflectionTag.Imperativ:
        return 'imperativ';

      case InflectionTag.Passiv:
        return 'passiv';

      case InflectionTag.Adjektiv:
        return 'adjektiv';

      case InflectionTag.Adverb:
        return 'adverb';

      case InflectionTag.Eintal:
        return 'eintal';

      case InflectionTag.HankjoennHokjoenn:
        return 'hankjønn/hokjønn';

      case InflectionTag.Hankjoenn:
        return 'hankjønn';

      case InflectionTag.Hokjoenn:
        return 'hokjønn';

      case InflectionTag.Inkjekjoenn:
        return 'inkjekjønn';

      case InflectionTag.Ubestemt:
        return 'ubestemt';

      case InflectionTag.Bestemt:
        return 'bestemt';

      case InflectionTag.Fleirtal:
        return 'fleirtal';

      case InflectionTag.Superlativ:
        return 'superlativ';

      case InflectionTag.Komparativ:
        return 'komparativ';

      case InflectionTag.Positiv:
        return 'positiv';

      case InflectionTag.Nominativ:
        return 'nominativ';

      case InflectionTag.Akkusativ:
        return 'akkusativ';

      default:
        return tag;
    }
  }

  /**
   * Returns a URL to the given article on ordbokene.no.
   * @param article The article to get the URL for.
   */
  getUrl(article: { id: number; dictionary: Dictionary }): string {
    if (article.dictionary === Dictionary.NorskOrdbok) {
      return '';
    }

    return `https://ordbokene.no/${
      article.dictionary === Dictionary.Bokmaalsordboka ? 'bm' : 'nn'
    }/${article.id}`;
  }
}
