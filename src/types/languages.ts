export enum Language {
  Bokmål = 'nb',
  Nynorsk = 'nn',
  English = 'en',
}

export enum DisplayLanguage {
  Norwegian = 'no',
  English = 'en',
}

export const LanguageName: Record<DisplayLanguage, Record<Language, string>> = {
  [DisplayLanguage.Norwegian]: {
    [Language.Bokmål]: 'bokmål',
    [Language.Nynorsk]: 'nynorsk',
    [Language.English]: 'engelsk',
  },
  [DisplayLanguage.English]: {
    [Language.Bokmål]: 'Bokmål',
    [Language.Nynorsk]: 'Nynorsk',
    [Language.English]: 'English',
  },
};
