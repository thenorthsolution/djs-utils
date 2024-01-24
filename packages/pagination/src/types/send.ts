import { Message, MessageResolvable, RepliableInteraction } from 'discord.js';
import { SendAs } from './enums';

export interface InteractionPaginationSendOptions {
    command: RepliableInteraction;
    followUp?: MessageResolvable|boolean;
    sendAs: (keyof typeof SendAs)|SendAs;
}

export interface MessagePaginationSendOptions {
    command: Message;
    sendAs: (keyof typeof SendAs)|SendAs;
}