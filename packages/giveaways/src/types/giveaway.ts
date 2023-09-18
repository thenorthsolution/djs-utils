import { GuildTextBasedChannel } from 'discord.js';
import { BaseDatabaseAdapter } from '../classes/BaseDatabaseAdapter';
import { GiveawayManager } from '../classes/GiveawayManager';

export interface IGiveaway {
    id: string;
    guildId: string;
    channelId: string;
    messageId: string;
    authorId?: string;
    name: string;
    winnerCount: number;
    endsAt: Date;
    createdAt: Date;
    ended: boolean;
    endedAt: Date|null;
    winnersEntryId: string[];
}

export interface IGiveawayEntry {
    id: string;
    giveawayId: string;
    userId: string;
    createdAt: Date;
}

export type CreateGiveawayMessageOptions = Omit<IGiveaway, 'id'|'messageId'|'channelId'|'guildId'> & { id?: string; entries?: number; };

export interface createGiveawayEmbedOptions<A extends BaseDatabaseAdapter = BaseDatabaseAdapter> extends CreateGiveawayMessageOptions {
    manager: GiveawayManager<A>;
    allEntries: IGiveawayEntry[];
    allWinners: string[];
}

export interface CreateGiveawayOptions {
    channel: GuildTextBasedChannel;
    name: string;
    endsAt: Date|number;
    authorId?: string;
    winnerCount?: number;
    content?: string;
}