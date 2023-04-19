import { APIButtonComponentWithCustomId, ButtonBuilder, InteractionButtonComponentData } from 'discord.js';
import { PaginationControllerType } from './enums';

export enum ButtonPaginationOnEnd {
    Ignore = 1,
    RemoveComponents,
    DisableComponents,
    DeletePagination
}

export interface ButtonPaginationController {
    button: ButtonBuilder;
    type: PaginationControllerType;
}

export interface ButtonPaginationControllerResolavable{
    button: ButtonBuilder|InteractionButtonComponentData|APIButtonComponentWithCustomId;
    type: (keyof typeof PaginationControllerType)|PaginationControllerType;
}

export function resolveButtonBuilder(button: ButtonBuilder|InteractionButtonComponentData|APIButtonComponentWithCustomId): ButtonBuilder {
    return button instanceof ButtonBuilder ? button : new ButtonBuilder(button);
}