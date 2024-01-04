import { RawGiveaway, RawGiveawayEntry } from '../types/structures';
import { GiveawayManager } from './GiveawayManager';
import { TypedEmitter } from 'fallout-utility';

export interface GiveawayDatabaseAdapterDataFilterOptions<D = any> {
    filter?: Partial<D>;
    count?: number;
};

export interface BaseGiveawayDatabaseAdapterEvents {
    giveawayCreate: [giveaway: RawGiveaway];
    giveawayUpdate: [oldGiveaway: RawGiveaway, newGiveaway: RawGiveaway];
    giveawayDelete: [giveaway: RawGiveaway];
    giveawayEntryCreate: [entry: RawGiveawayEntry];
    giveawayEntryUpdate: [oldEntry: RawGiveawayEntry, newEntry: RawGiveawayEntry];
    giveawayEntryDelete: [entry: RawGiveawayEntry];
}

export abstract class BaseGiveawayDatabaseAdapter extends TypedEmitter<BaseGiveawayDatabaseAdapterEvents> {
    public manager!: GiveawayManager<this>;

    public async start(manager: GiveawayManager<this>): Promise<void> {
        this.manager = manager;
    }

    public abstract fetchGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>): Promise<RawGiveaway[]>;
    public abstract updateGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>, data: Partial<RawGiveaway>): Promise<RawGiveaway[]>;
    public abstract deleteGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>): Promise<RawGiveaway[]>;
    public abstract createGiveaway(data: Omit<RawGiveaway, 'id'>): Promise<RawGiveaway>;

    public abstract fetchGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>): Promise<RawGiveawayEntry[]>;
    public abstract updateGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>, data: Partial<RawGiveawayEntry>): Promise<RawGiveawayEntry[]>;
    public abstract deleteGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>): Promise<RawGiveawayEntry[]>;
    public abstract createGiveawayEntry(data: Omit<RawGiveawayEntry, 'id'>): Promise<RawGiveawayEntry>;
}