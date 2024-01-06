import { BaseGiveawayDatabaseAdapter, GiveawayDatabaseAdapterDataFilterOptions } from '../BaseGiveawayDatabaseAdapter';
import { InferSchemaType, Model, Mongoose, Schema } from 'mongoose';
import { JSONEncodable, isJSONEncodable } from 'fallout-utility';
import { RawGiveaway, RawGiveawayEntry } from '../../types/structures';
import { GiveawayManager } from '../GiveawayManager';

export interface MongodbDatabaseAdapterOptions {
    mongooseConnection: Mongoose|string;
    giveawaysModel?: Model<RawMongodbGiveaway>;
    giveawayEntriesModel?: Model<RawMongodbGiveawayEntry>;
}

export type RawMongodbGiveaway = InferSchemaType<MongodbDatabaseAdapter['giveawaySchema']>;
export type RawMongodbGiveawayEntry = InferSchemaType<MongodbDatabaseAdapter['giveawayEntrySchema']>;

export class MongodbDatabaseAdapter extends BaseGiveawayDatabaseAdapter {
    public mongoose?: Mongoose;
    public giveawaysModel!: Model<RawMongodbGiveaway>;
    public giveawayEntriesModel!: Model<RawMongodbGiveawayEntry>;

    constructor(readonly options: MongodbDatabaseAdapterOptions) {
        super();
    }

    public async start(manager: GiveawayManager<this>): Promise<void> {
        if (typeof this.options.mongooseConnection !== 'string') {
            this.mongoose ??= this.options.mongooseConnection;
        } else {
            const mongoose = await import('mongoose');
            this.mongoose ??= await mongoose.connect(this.options.mongooseConnection);
        }

        this.giveawaysModel = this.options.giveawaysModel ?? this.mongoose.model('Giveaways', this.giveawaySchema, 'Giveaways');
        this.giveawayEntriesModel = this.options.giveawayEntriesModel ?? this.mongoose.model('GiveawayEntries', this.giveawayEntrySchema, 'GiveawayEntries');

        await super.start(manager);
    }

    public async fetchGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>): Promise<RawGiveaway[]> {
        const data = await this.giveawaysModel.find(filter.filter ?? {}, null, { limit: filter.count });
        return data.map(MongodbDatabaseAdapter.parseGiveawayDocument);
    }

    public async updateGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>, data: Partial<RawGiveaway>): Promise<RawGiveaway[]> {
        const giveaways = await this.fetchGiveaways(filter);
        if (!giveaways.length) return [];

        await this.giveawaysModel.updateMany({
            id: { $in: giveaways.map(giveaway => giveaway.id) },
        }, data);

        const newGiveaways = giveaways.map(g => ({ ...g, ...data }));

        for (const giveaway of newGiveaways) {
            const oldGiveaway = giveaways.find(g => g.id === giveaway.id)!;
            this.emit('giveawayUpdate', oldGiveaway, giveaway);
        }

        return newGiveaways;
    }

    public async deleteGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>): Promise<RawGiveaway[]> {
        const giveaways = await this.fetchGiveaways(filter);
        if (!giveaways.length) return [];

        const entries = (await this.giveawayEntriesModel.find({
            giveawayId: { $in: giveaways.map(g => g.id) }
        })).map(MongodbDatabaseAdapter.parseGiveawayEntryDocument);

        await this.giveawaysModel.deleteMany({ id: { $in: giveaways.map(g => g.id) } });
        await this.giveawayEntriesModel.deleteMany({ id: { $in: entries.map(e => e.id) } });

        for (const giveaway of giveaways) {
            for (const entry of entries.filter(e => e.giveawayId === giveaway.id)) {
                this.emit('giveawayEntryDelete', entry);
            }

            this.emit('giveawayDelete', giveaway);
        }

        return giveaways;
    }

    public async createGiveaway(data: Omit<RawGiveaway, 'id'>): Promise<RawGiveaway> {
        const giveaway = MongodbDatabaseAdapter.parseGiveawayDocument(await this.giveawaysModel.create({ id: data.messageId, ...data }));
        this.emit('giveawayCreate', giveaway);
        return giveaway;
    }

    public async fetchGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        const data = await this.giveawayEntriesModel.find(filter.filter ?? {}, null, { limit: filter.count });
        return data.map(MongodbDatabaseAdapter.parseGiveawayEntryDocument);
    }

    public async updateGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>, data: Partial<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        const entries = await this.fetchGiveawayEntries(filter);
        if (!entries.length) return [];

        await this.giveawayEntriesModel.updateMany({
            id: { $in: entries.map(entry => entry.id) },
        }, data);

        const newEntries = entries.map(e => ({ ...e, ...data }));

        for (const entry of newEntries) {
            const oldEntry = entries.find(g => g.id === entry.id)!;
            this.emit('giveawayEntryUpdate', oldEntry, entry);
        }

        return newEntries;
    }

    public async deleteGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        const entries = await this.fetchGiveawayEntries(filter);
        if (!entries.length) return [];

        await this.giveawayEntriesModel.deleteMany({ id: { $in: entries.map(e => e.id) } });

        for (const entry of entries) {
            this.emit('giveawayEntryDelete', entry);
        }

        return entries;
    }

    public async createGiveawayEntry(data: Omit<RawGiveawayEntry, 'id'>): Promise<RawGiveawayEntry> {
        const id = Number(BigInt(Date.now()) << 22n).toString();
        const entry = MongodbDatabaseAdapter.parseGiveawayEntryDocument(await this.giveawayEntriesModel.create({ id, ...data }));
        this.emit('giveawayEntryCreate', entry);
        return entry;
    }

    public static parseGiveawayDocument(document: RawMongodbGiveaway|JSONEncodable<RawMongodbGiveaway>): RawGiveaway {
        const data = isJSONEncodable(document) ? document.toJSON() : document;

        return {
            id: data.id,
            guildId: data.guildId,
            channelId: data.channelId,
            messageId: data.messageId,
            hostId: data.hostId ?? undefined,
            name: data.name,
            description: data.description ?? undefined,
            winnerCount: data.winnerCount,
            createdAt: data.createdAt,
            paused: data.paused,
            remaining: data.remaining ?? undefined,
            ended: data.ended,
            dueDate: data.dueDate,
            riggedUsersId: data.riggedUsersId ?? undefined,
            winnersEntryId: data.winnersEntryId,
        };
    }

    public static parseGiveawayObject(data: RawGiveaway|JSONEncodable<RawGiveaway>): RawMongodbGiveaway;
    public static parseGiveawayObject(data: Partial<RawGiveaway>|JSONEncodable<Partial<RawGiveaway>>): Partial<RawMongodbGiveaway>;
    public static parseGiveawayObject(data: RawGiveaway|JSONEncodable<RawGiveaway>|Partial<RawGiveaway>|JSONEncodable<Partial<RawGiveaway>>): RawMongodbGiveaway|Partial<RawMongodbGiveaway> {
        data = isJSONEncodable(data) ? data.toJSON() : data;
        return data;
    }

    public static parseGiveawayEntryDocument(document: RawMongodbGiveawayEntry|JSONEncodable<RawMongodbGiveawayEntry>): RawGiveawayEntry {
        const data = isJSONEncodable(document) ? document.toJSON() : document;

        return {
            id: data.id,
            giveawayId: data.giveawayId,
            userId: data.userId,
            chance: data.chance,
            createdAt: data.createdAt,
        };
    }

    public static parseGiveawayEntryObject(data: RawGiveawayEntry|JSONEncodable<RawGiveawayEntry>): RawMongodbGiveawayEntry
    public static parseGiveawayEntryObject(data: Partial<RawGiveawayEntry>|JSONEncodable<Partial<RawGiveawayEntry>>): Partial<RawMongodbGiveawayEntry>;
    public static parseGiveawayEntryObject(data: RawGiveawayEntry|JSONEncodable<RawGiveawayEntry>|Partial<RawGiveawayEntry>|JSONEncodable<Partial<RawGiveawayEntry>>): RawMongodbGiveawayEntry|Partial<RawMongodbGiveawayEntry> {
        data = isJSONEncodable(data) ? data.toJSON() : data;
        return data;
    }

    public static giveawaySchema = new Schema({
        id: { type: String, required: true, unique: true },
        guildId: { type: String, required: true },
        channelId: { type: String, required: true },
        messageId: { type: String, required: true },
        hostId: String,
        name: { type: String, required: true },
        description: String,
        winnerCount: { type: Number, required: true },
        createdAt: { type: Date, required: true },
        paused: { type: Boolean, required: true },
        remaining: Number,
        ended: { type: Boolean, required: true },
        dueDate: { type: Date, required: true },
        riggedUsersId: { type: [{ type: String, required: true }], required: false },
        winnersEntryId: [{ type: String, required: true }],
    });

    public static giveawayEntrySchema = new Schema({
        id: { type: String, required: true, unique: true },
        giveawayId: { type: String, required: true },
        userId: { type: String, required: true },
        chance: { type: Number, required: true },
        createdAt: { type: Date, required: true }
    });

    public giveawaySchema = MongodbDatabaseAdapter.giveawaySchema;
    public giveawayEntrySchema = MongodbDatabaseAdapter.giveawayEntrySchema;
}