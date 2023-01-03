import { PaginationControllerType } from './enums';

export enum ReactionsOnDisable {
    Ignore = 1,
    ClearAllReactions,
    ClearPaginationReactions,
    DeletePagination
}

export interface Reaction {
    id: string|null;
    name: string;
    type: PaginationControllerType;
}

export interface RawReaction {
    emoji: string;
    type: PaginationControllerType|keyof typeof PaginationControllerType;
}