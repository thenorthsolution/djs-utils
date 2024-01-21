import { disableComponents } from './types/actionRow';
import { deprecate } from 'node:util';

export * from './classes/BasePaginationBuilder';
export * from './classes/ButtonPaginationBuilder';
export * from './classes/ReactionPaginationBuilder';
export * from './types/actionRow';
export * from './types/buttons';
export * from './types/enums';
export * from './types/page';
export * from './types/reactions';
export * from './types/send';

/**
 * @deprecated disabledComponents() is deprecated. Use disableComponents() instead
 */
export const disabledComponents = deprecate(disableComponents, 'disabledComponents() is deprecated. Use disableComponents() instead')