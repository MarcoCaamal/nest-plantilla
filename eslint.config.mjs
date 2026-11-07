import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

const element = (type) => ({ element: { type } });
const local = (types) => ({ to: { element: { type: types } } });
const sameFeature = (type) => ({
  to: {
    element: {
      type,
      captured: { feature: '{{ from.element.captured.feature }}' },
    },
  },
});
const external = { to: { module: { origin: ['external', 'core'] } } };

/**
 * Boundaries are not style preferences: illegal imports fail CI.
 * Classifications are folder-based; nested feature-domain wins over feature root.
 * Using checkAllOrigins makes external imports forbidden in pure layers as well.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '.cache/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
      },
    },
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': [
        { type: 'shared-core', pattern: 'src/shared/core' },
        { type: 'shared-domain', pattern: 'src/shared/domain' },
        { type: 'shared-application', pattern: 'src/shared/application' },
        { type: 'shared-infrastructure', pattern: 'src/shared/infrastructure' },
        { type: 'feature-domain', pattern: 'src/modules/*/domain', capture: ['feature'] },
        { type: 'feature-application', pattern: 'src/modules/*/application', capture: ['feature'] },
        { type: 'feature-infrastructure', pattern: 'src/modules/*/infrastructure', capture: ['feature'] },
        { type: 'feature-root', pattern: 'src/modules/*', capture: ['feature'] },
        { type: 'bootstrap', pattern: 'src' },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        checkAllOrigins: true,
        checkInternals: true,
        policies: [
          // shared/core: default deny, including external packages and other core files.
          { from: element('shared-domain'), allow: local(['shared-core', 'shared-domain']) },
          { from: element('shared-application'), allow: local(['shared-core', 'shared-domain', 'shared-application']) },
          { from: element('shared-infrastructure'), allow: [local(['shared-core', 'shared-domain', 'shared-application', 'shared-infrastructure']), external] },
          { from: element('feature-domain'), allow: [local(['shared-core', 'shared-domain']), sameFeature('feature-domain')] },
          { from: element('feature-application'), allow: [
            local(['shared-core', 'shared-domain', 'shared-application']),
            sameFeature('feature-domain'),
            sameFeature('feature-application'),
          ] },
          { from: element('feature-infrastructure'), allow: [
            local(['shared-core', 'shared-domain', 'shared-application', 'shared-infrastructure']),
            sameFeature('feature-domain'),
            sameFeature('feature-application'),
            sameFeature('feature-infrastructure'),
            external,
          ] },
          { from: element('feature-root'), allow: [
            local(['shared-core', 'shared-domain', 'shared-application', 'shared-infrastructure']),
            sameFeature('feature-domain'),
            sameFeature('feature-application'),
            sameFeature('feature-infrastructure'),
            sameFeature('feature-root'),
            external,
          ] },
          { from: element('bootstrap'), allow: [{ to: { element: { type: '*' } } }, external] },
        ],
      }],
      'boundaries/no-unknown-files': 'error',
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['class-validator', 'class-transformer', 'nestjs-zod'],
          message: 'Nest Plantilla uses native NestJS 12 Standard Schema + Zod 4.',
        }],
      }],
    },
  },
  {
    files: [
      'src/shared/core/**/*.ts',
      'src/shared/domain/**/*.ts',
      'src/shared/application/**/*.ts',
      'src/modules/*/domain/**/*.ts',
      'src/modules/*/application/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'ThrowStatement',
        message: 'Domain and application must represent expected failures as Result<T,E>; do not throw.',
      }],
    },
  },
);
