import { ButtonBuilder, InteractionButtonComponentData } from 'discord.js';
import { PaginationControllerType } from './enums';

export enum ButtonsOnDisable {
    Ignore = 1,
    RemoveComponents,
    DisableComponents,
    DeletePagination
}

export interface Button {
    builder: ButtonBuilder;
    type: PaginationControllerType;
}

export interface RawButton {
    builder: ButtonBuilder|InteractionButtonComponentData;
    type: PaginationControllerType|keyof typeof PaginationControllerType;
}