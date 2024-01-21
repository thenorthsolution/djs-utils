import { ButtonStyle, GuildTextBasedChannel, InteractionButtonComponentData } from 'discord.js';
import { BaseGiveawayDatabaseAdapter } from '../classes/BaseGiveawayDatabaseAdapter';
import { GiveawayManager } from '../classes/GiveawayManager';

export interface RawGiveaway {
    id: string;
    guildId: string;
    channelId: string;
    messageId: string;
    hostId?: string;
    name: string;
    description?: string;
    winnerCount: number;
    createdAt: Date;
    paused: boolean;
    remaining?: number;
    ended: boolean;
    dueDate: Date;
    riggedUsersId?: string[];
    winnersEntryId: string[];
}

export interface RawGiveawayEntry {
    id: string;
    giveawayId: string;
    userId: string;
    chance: number;
    createdAt: Date;
}

export interface GiveawayManagerEntriesData {
    allEntries: RawGiveawayEntry[];
    selectedEntries: RawGiveawayEntry[];
    riggedUsersId: string[];
    winnersUserId: string[];
}

export interface GiveawayManagerCreateGiveawayMessageOptions {
    giveaway: (Omit<RawGiveaway, 'id'|'messageId'|'channelId'|'guildId'> & { id?: string; messageId?: string; channelId?: string; guildId?: string; })|RawGiveaway;
    entries?: GiveawayManagerEntriesData;
}

export interface GiveawayManagerCreateGiveawayEmbedOptions<Database extends BaseGiveawayDatabaseAdapter = BaseGiveawayDatabaseAdapter> extends GiveawayManagerCreateGiveawayMessageOptions {
    manager: GiveawayManager<Database>;
}

export interface GiveawayManagerButtonOptions extends Omit<InteractionButtonComponentData, 'disabled'|'type'|'style'> {
    style: Omit<ButtonStyle, ButtonStyle.Link>;
};

export interface GiveawayManagerCreateGiveawayOptions {
    channel: GuildTextBasedChannel;
    content?: string;
    name: string;
    description?: string;
    endsAt: Date|number;
    hostId?: string;
    winnerCount?: number;
    riggedUsersId?: string[];
}

export interface GiveawayManagerSelectGiveawayEntriesOptions {
    winnerCount?: number;
    countRiggedUsers?: boolean;
    rigged?: boolean;
    ignoredUsersId?: string[];
}

export interface GiveawayManagerRerollGiveawayOptions {
    winnerCount?: number;
    ignoredUsersId?: string[];
}