import { TypedEmitter } from 'fallout-utility';
import { IGiveaway, IGiveawayEntry } from '../types/giveaway';
import { GiveawayManager } from './GiveawayManager';

export interface BaseDatabaseAdapterEvents {
    giveawayCreate: [giveaway: IGiveaway];
    giveawayUpdate: [oldGiveaway: IGiveaway, newGiveaway: IGiveaway];
    giveawayDelete: [giveaway: IGiveaway];
    giveawayEntryCreate: [entry: IGiveawayEntry];
    giveawayEntryUpdate: [oldEntry: IGiveawayEntry, newEntry: IGiveawayEntry];
    giveawayEntryDelete: [entry: IGiveawayEntry];
    error: [error: Error];
}

export abstract class BaseDatabaseAdapter<Events extends BaseDatabaseAdapterEvents = BaseDatabaseAdapterEvents> extends TypedEmitter<Events> {
    public manager!: GiveawayManager<this>;

    public async start(manager: GiveawayManager<this>): Promise<void> {
        this.manager = manager;
    }

    public abstract fetchGiveaways(options?: { filter?: Partial<IGiveaway>, count?: number }): Promise<IGiveaway[]>;
    public abstract fetchGiveaway(giveawayId: string): Promise<IGiveaway|undefined>;
    public abstract createGiveaway(data: IGiveaway): Promise<IGiveaway>;
    public abstract updateGiveaway(giveawayId: string, data: Partial<IGiveaway>): Promise<IGiveaway>;
    public abstract deleteGiveaway(giveawayId: string): Promise<IGiveaway|undefined>;
    public abstract deleteGiveaway(filter: Partial<IGiveaway>, count?: number): Promise<IGiveaway[]>;

    public abstract fetchGiveawayEntries(options: { filter?: Partial<IGiveawayEntry>; count?: number; }): Promise<IGiveawayEntry[]>;
    public abstract fetchGiveawayEntry(entryId: string): Promise<IGiveawayEntry|undefined>;
    public abstract createGiveawayEntry(giveawayId: string, data: IGiveawayEntry): Promise<IGiveawayEntry>;
    public abstract updateGiveawayEntry(entryId: string, data: Partial<IGiveawayEntry>): Promise<IGiveawayEntry>;
    public abstract deleteGiveawayEntry(entryId: string): Promise<IGiveawayEntry|undefined>;
    public abstract deleteGiveawayEntry(filter: Partial<IGiveawayEntry>, count?: number): Promise<IGiveawayEntry[]>;
}