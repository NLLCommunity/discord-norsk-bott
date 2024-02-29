import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: 'https://api.ordbokapi.org/graphql',
  documents: 'src/**/*.ts{,x}',
  emitLegacyCommonJSImports: false,
  generates: {
    'src/gql/': {
      preset: 'client',
      plugins: [],
    },
  },
};

export default config;
