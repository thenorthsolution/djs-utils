import { EmojiResolvable, parseEmoji } from 'discord.js';
import { PaginationControllerType, getEnumValue } from '../types/enums';

export enum ReactionPaginationOnEnd {
    Ignore = 1,
    ClearAllReactions,
    ClearPaginationReactions,
    DeletePagination
}

export interface ReactionPaginationReactionController {
    id: string|null;
    name: string;
    type: PaginationControllerType;
}

export interface ReactionPaginationReactionControllerResolvable {
    emoji: EmojiResolvable;
    type: (keyof typeof PaginationControllerType)|PaginationControllerType;
}

export function resolveReactionController(reaction: ReactionPaginationReactionControllerResolvable|ReactionPaginationReactionController): ReactionPaginationReactionController {
    if ((reaction as ReactionPaginationReactionController).id !== undefined || (reaction as ReactionPaginationReactionController).name !== undefined) return reaction as ReactionPaginationReactionController;

    const reactionEmoji = (reaction as ReactionPaginationReactionControllerResolvable).emoji;
    const parsedEmoji = typeof reactionEmoji === 'string' ? parseEmoji(reactionEmoji) : reactionEmoji;

    if (!parsedEmoji?.id && !parsedEmoji?.name || !parsedEmoji?.name || parsedEmoji.animated && !parsedEmoji.id) throw new Error(`Couldn't parse emoji`);

    return {
        id: parsedEmoji.id ?? null,
        name: parsedEmoji.name,
        type: getEnumValue(PaginationControllerType, reaction.type)
    };
}